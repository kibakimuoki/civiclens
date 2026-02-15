import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";

// ==========================
// MODEL SETTINGS
// ==========================
env.localModelPath = null;
env.allowLocalModels = false;
env.remoteModels = true;
env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1/dist/";
env.backends.onnx.wasm.proxy = false;

// ==========================
// DOM ELEMENTS
// ==========================
const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const resultsDiv = document.getElementById("results");
const status = document.getElementById("status");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");

let uploadedFiles = [];
let summarizer = null;

// ==========================
// FILE SELECTION
// ==========================
fileInput.addEventListener("change", (e) => {
  uploadedFiles = Array.from(e.target.files);
  status.innerText = uploadedFiles.length + " file(s) ready.";
});

// ==========================
// PROCESS BUTTON
// ==========================
processBtn.addEventListener("click", async () => {
  if (uploadedFiles.length === 0) {
    alert("Upload files first.");
    return;
  }

  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.innerText = "0%";
  status.innerText = "Loading AI model...";

  if (!summarizer) {
    try {
      summarizer = await pipeline("summarization", "Xenova/distilbart-cnn-6-6");

      if (!summarizer) throw new Error("AI model failed to load");
      status.innerText = "AI model loaded.";
    } catch (err) {
      console.warn("AI model failed to load:", err);
      status.innerText = "AI model failed. Using fallback summaries.";
      summarizer = null;
    }
  }

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    try {
      status.innerText = `Processing file ${i + 1}/${uploadedFiles.length}: ${file.name}`;
      const rawText = await extractText(file);

      if (!rawText || !rawText.trim()) {
        displayResult({
          title: file.name,
          date: "Unknown",
          sector: "Unknown",
          summary: "Failed to extract text from this file.",
          fullText: ""
        });
        continue;
      }

      let cleaned = cleanExtractedText(rawText);
      cleaned = cleanText(cleaned);
      cleaned = normalizeBillStructure(cleaned);

      const structured = await analyzeDocument(cleaned, file.name);
      displayResult(structured);

    } catch (err) {
      console.error("Failed processing file:", file.name, err);
      status.innerText = `Error processing file: ${file.name}`;
    }
  }

  status.innerText = "Done.";
  uploadedFiles = [];
  fileInput.value = "";
  progressBar.style.width = "100%";
  progressBar.innerText = "100%";
});

// ==========================
// EXTRACT TEXT (PDF + TXT) with OCR
// ==========================
async function extractText(file) {
  if (file.type !== "application/pdf") {
    return await file.text();
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = "";
  let ocrPagesUsed = 0;
  const MAX_OCR_PAGES = 5;
  const MAX_TOTAL_CHARS = 8000;

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map(item => item.str).join(" ").trim();

      if (pageText.length < 50 && ocrPagesUsed < MAX_OCR_PAGES) {
        ocrPagesUsed++;
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const ocr = await Tesseract.recognize(canvas, "eng");
        pageText = ocr.data.text.trim();
      }

      fullText += pageText + " ";
      if (fullText.length > MAX_TOTAL_CHARS) break;

      const percent = Math.round((i / pdf.numPages) * 100);
      progressBar.style.width = percent + "%";
      progressBar.innerText = `Extracting: ${percent}%`;

    } catch (err) {
      console.warn("Page failed:", err);
    }
  }

  return fullText.trim();
}

// ==========================
// STRONG OCR CLEANING
// ==========================
function cleanExtractedText(text) {
  if (!text) return "";

  text = text.replace(/[^\x00-\x7F]/g, " ");
  text = text.replace(/\s+/g, " ");
  text = text.replace(/([A-Z]\s){5,}/g, "");
  text = text.replace(/[,.;:'"`]{3,}/g, "");
  text = text.replace(/SPECIAL ISSUE.*?BILLS, 2025/gi, "");
  text = text.replace(/ARRANGEMENT OF CLAUSES.*?PART I/gi, "");
  text = text.replace(/FIRST SCHEDULE.*?/gi, "");
  text = text.replace(/SECOND SCHEDULE.*?/gi, "");
  return text.trim();
}

// ==========================
// NORMALIZE BILL STRUCTURE
// ==========================
function normalizeBillStructure(text) {
  if (!text) return "";

  // Break into lines for stronger filtering
  let lines = text.split(/\r?\n/);

  lines = lines.filter(line => {
    const l = line.trim();

    if (!l) return false;

    // Remove registry / stamp junk
    if (/NATIONAL ASSEMBLY RECEIVED/i.test(l)) return false;
    if (/DIRECTOR LEGAL SERVICES/i.test(l)) return false;
    if (/P\.?\s?O\.?\s?Box/i.test(l)) return false;
    if (/REPUBLIC OF KENYA/i.test(l)) return false;
    if (/NAIROBI/i.test(l)) return false;

    // Remove lines with too many numbers or symbols (OCR garbage)
    const letters = (l.match(/[a-zA-Z]/g) || []).length;
    if (letters < 15) return false;

    return true;
  });

  text = lines.join("\n");

  // Prefer OBJECTS AND REASONS section
  const objectsMatch = text.match(/OBJECTS AND REASONS[\s\S]{300,4000}/i);
  if (objectsMatch) return objectsMatch[0];

  // Extract main bill body starting from Clause 1
  const clauseMatch = text.match(/Clause\s+1[\s\S]{300,4000}/i);
  if (clauseMatch) return clauseMatch[0];

  // Extract Hansard debate
  const hansardMatch = text.match(/The House met[\s\S]{300,4000}/i);
  if (hansardMatch) return hansardMatch[0];

  // Extract Order Paper business
  const orderMatch = text.match(/ORDER OF BUSINESS[\s\S]{300,4000}/i);
  if (orderMatch) return orderMatch[0];

  // Fallback (skip first 300 characters of junk)
  return text.substring(300, 3500);
}




// ==========================
// BASIC CLEANING
// ==========================
function cleanText(text) {
  if (!text) return "";
  text = text.replace(/(\d+)\s+t\s+h/gi, "$1th");
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}

// ==========================
// DOCUMENT ANALYSIS
// ==========================
async function analyzeDocument(text, filename) {
  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  const date = extractDate(text) || "Not detected";
  const sector = detectSector(text);

  let summary = text.substring(0, 300) + "...";

  if (text.length > 200 && summarizer) {
    try {
      const aiSummary = await generateSummary(text);
      if (aiSummary && aiSummary.length > 40) {
        summary = aiSummary;
      }
    } catch {
      summary = text.substring(0, 300) + "...";
    }
  }

  return {
    title,
    date,
    sector,
    summary,
    fullText: text.substring(0, 8000)
  };
}

// ==========================
// DATE & SECTOR
// ==========================
function extractDate(text) {
  const patterns = [
    /\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i
  ];
  for (let p of patterns) {
    const match = text.match(p);
    if (match) return match[0];
  }
  return null;
}

function detectSector(text) {
  const lower = text.toLowerCase();
  if (lower.includes("defence") || lower.includes("security")) return "Security";
  if (lower.includes("finance") || lower.includes("budget")) return "Finance";
  if (lower.includes("education")) return "Education";
  if (lower.includes("environment")) return "Environment";
  if (lower.includes("health")) return "Health";
  return "General Governance";
}

// ==========================
// SAFE AI SUMMARY
// ==========================
async function generateSummary(text) {
  if (!text || !summarizer) return text.substring(0, 300) + "...";

  const chunkSize = 700;
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  const summaries = [];

  for (let chunk of chunks) {
    try {
      const res = await summarizer(chunk, {
        min_length: 80,
        max_length: 200,
        do_sample: false
      });
      summaries.push(res?.[0]?.summary_text || "");
    } catch {
      summaries.push("");
    }
  }

  return summaries.join(" ");
}

// ==========================
// SAFE HTML ESCAPE
// ==========================
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==========================
// DISPLAY RESULTS (SAFE)
// ==========================
function displayResult(doc) {
  document.getElementById("placeholder")?.remove();

  const card = document.createElement("div");
  card.className = "summary-card";

  card.innerHTML = `
    <h3>${escapeHTML(doc.title)}</h3>
    <p><strong>Date:</strong> ${escapeHTML(doc.date)}</p>
    <p><strong>Sector:</strong> ${escapeHTML(doc.sector)}</p>
    <p><strong>AI Summary:</strong> ${escapeHTML(doc.summary)}</p>
    <p style="font-size: 12px; opacity: 0.7;">
    
    This summary was generated using Xenova/distilbart-cnn-6-6.
    OCR errors or formatting noise may affect accuracy.
    </p>

    <details>
      <summary>View Extracted Text</summary>
      <p>${escapeHTML(doc.fullText)}</p>
    </details>
  `;

  resultsDiv.prepend(card);
}
