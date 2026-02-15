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

  // Load AI summarizer safely
  if (!summarizer) {
    try {
      summarizer = await pipeline("summarization", "Xenova/t5-small");
      if (!summarizer) throw new Error("AI model failed to load");
      status.innerText = "AI model loaded.";
    } catch (err) {
      console.warn("AI model failed to load:", err);
      status.innerText = "AI model failed. Summaries will use fallback text.";
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

      const cleaned = cleanText(rawText);
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
// EXTRACT TEXT (PDF + TXT) with OCR + TIMEOUT
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
  const MAX_TOTAL_CHARS = 6000;

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map(item => item.str).join(" ").trim();

      // If almost no selectable text → use OCR
      if (pageText.length < 50 && ocrPagesUsed < MAX_OCR_PAGES) {
        console.log("Running OCR on page", i);
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

      // Stop early if we already have enough text
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
// CLEAN TEXT
// ==========================
function cleanText(text) {
  if (!text) return "";
  text = text.replace(/(\d+)\s+t\s+h/gi, "$1th");
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/\s{2,}/g, " ");
  text = text.replace(/(\r\n|\n|\r)/gm, " ");
  return text.trim();
}

// ==========================
// DOCUMENT ANALYSIS
// ==========================
async function analyzeDocument(text, filename) {
  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  const date = extractDate(text) || "Not detected";
  const sector = detectSector(text);

  let summary = text.length > 0 ? text.substring(0, 300) + "..." : "No summary available.";

  try {
    let aiSummary = "";
    if (summarizer && text && text.trim()) {
      aiSummary = await generateSummary(text);
    } else {
      aiSummary = text.substring(0, 300) + "...";
    }
    if (aiSummary && aiSummary.length > 10) summary = aiSummary;
  } catch (err) {
    console.warn("Summary failed, using fallback.", err);
  }

  return { title, date, sector, summary, fullText: text.substring(0, 8000) };
}

// ==========================
// DATE & SECTOR DETECTION
// ==========================
function extractDate(text) {
  if (!text) return null;
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
  if (!text) return "General Governance";
  const lower = text.toLowerCase();
  if (lower.includes("defence") || lower.includes("security") || lower.includes("army")) return "Security";
  if (lower.includes("finance") || lower.includes("treasury") || lower.includes("budget")) return "Finance";
  if (lower.includes("education")) return "Education";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("health")) return "Health";
  return "General Governance";
}

// Noise Cleaning Function

function cleanExtractedText(text) {
  if (!text) return "";

  // Remove excessive spacing
  text = text.replace(/\s+/g, " ");

  // Remove common Gazette noise
  text = text.replace(/SPECIAL ISSUE.*?BILLS, 2025/gi, "");
  text = text.replace(/ARRANGEMENT OF CLAUSES.*?PART I/gi, "");
  text = text.replace(/FIRST SCHEDULE.*?/gi, "");
  text = text.replace(/SECOND SCHEDULE.*?/gi, "");

  // Remove weird OCR symbols
  text = text.replace(/[^\x00-\x7F]/g, "");

  return text.trim();
}


// ==========================
// AI SUMMARY (safe, fallback)
// ==========================
async function generateSummary(text) {
  if (!text) return "No text available to summarize.";

  text = text.toString().replace(/THE HANSARD[\s\S]+?COMMUNICATION FROM THE CHAIR/i, "");
  text = text.replace(/(Disclaimer|National Assembly Debates|Electronic version|Hansard Editor)/gi, "");

  if (!summarizer) return text.substring(0, 300) + "...";

  const chunkSize = 400;
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  const summaries = [];
  for (let index = 0; index < chunks.length; index++) {
    try {
      const res = await summarizer(chunks[index], { min_length: 50, max_length: 130 });
      summaries[index] = res?.[0]?.summary_text || "";
    } catch {
      summaries[index] = "";
    }
  }

  return summaries.join(" ") || text.substring(0, 300) + "...";
}

// ==========================
// DISPLAY RESULTS
// ==========================
function displayResult(doc) {
  document.getElementById("placeholder")?.remove();

  const card = document.createElement("div");
  card.className = "summary-card";

  card.innerHTML = `
    <h3>${doc.title}</h3>
    <p><strong>Date:</strong> ${doc.date}</p>
    <p><strong>Sector:</strong> ${doc.sector}</p>
    <p><strong>AI Summary:</strong> ${doc.summary}</p>
    <details>
      <summary>View Extracted Text</summary>
      <p>${doc.fullText}</p>
    </details>
  `;

  resultsDiv.prepend(card);
}
