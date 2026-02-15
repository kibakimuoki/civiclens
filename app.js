import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";

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
  console.log("Files uploaded:", uploadedFiles);
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

  status.innerText = "Loading AI model (first time takes ~20s)...";

  if (!summarizer) {
    try {
      summarizer = await pipeline("summarization", "Xenova/t5-small");
    } catch (err) {
      status.innerText = "Failed to load AI model: " + err.message;
      return;
    }
  }

  status.innerText = "Processing documents...";

  const totalFiles = uploadedFiles.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = uploadedFiles[i];
    try {
      console.log("Processing file:", file.name);
      status.innerText = `Processing file ${i + 1} of ${totalFiles}: ${file.name}`;
      const rawText = await extractText(file, i, totalFiles);
      const cleaned = cleanText(rawText);
      const structured = await analyzeDocument(cleaned, file.name);
      displayResult(structured);
    } catch (err) {
      console.error("Failed processing file:", file.name, err);
      status.innerText = `Error processing file: ${file.name}`;
    }
    const percent = Math.round(((i + 1) / totalFiles) * 100);
    progressBar.style.width = percent + "%";
    progressBar.innerText = percent + "%";
  }

  status.innerText = "Done.";
  uploadedFiles = [];
  fileInput.value = "";
});

// ==========================
// TEXT EXTRACTION (PDF/TXT) with per-page progress
// ==========================
async function extractText(file, fileIndex = 0, totalFiles = 1) {
  if (file.type === "application/pdf") {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map(item => item.str).join(" ");

      // OCR fallback
      if (!pageText.trim()) {
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
        pageText = text;
      }

      fullText += pageText + " ";

      // Update progress for multi-page PDFs
      const pagePercent = Math.round((i / pdf.numPages) * 100);
      progressBar.style.width = pagePercent + "%";
      progressBar.innerText = `File ${fileIndex + 1}/${totalFiles}: ${pagePercent}%`;
    }

    return fullText;
  } else {
    return await file.text();
  }
}

// ==========================
// CLEAN TEXT
// ==========================
function cleanText(text) {
  text = text.replace(/(\d+)\s+t\s+h/gi, "$1th");
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/\s{2,}/g, " ");
  text = text.replace(/(\r\n|\n|\r)/gm, " ");
  return text.trim();
}

// ==========================
// ANALYZE DOCUMENT
// ==========================
async function analyzeDocument(text, filename) {
  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  const date = extractDate(text) || "Not detected";
  const sector = detectSector(text);

  let summary = "No summary available.";
  try {
    summary = await generateSummary(text);
  } catch (err) {
    console.warn("Summary failed:", err);
  }

  return { title, date, sector, summary, fullText: text.substring(0, 8000) };
}

// ==========================
// DOCUMENT TYPE DETECTOR
// ==========================
function detectDocumentType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("bill") && lower.includes("amendment")) return "bill";
  if (lower.includes("orders of the day") || lower.includes("order paper")) return "orderpaper";
  if (lower.includes("the hansard") || lower.includes("national assembly debates")) return "hansard";
  return "generic";
}

// ==========================
// SECTOR DETECTION
// ==========================
function detectSector(text) {
  const lower = text.toLowerCase();
  if (lower.includes("defence") || lower.includes("security") || lower.includes("army")) return "Security";
  if (lower.includes("finance") || lower.includes("treasury") || lower.includes("budget")) return "Finance";
  if (lower.includes("education")) return "Education";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("health")) return "Health";
  return "General Governance";
}

// ==========================
// DATE EXTRACTION
// ==========================
function extractDate(text) {
  const patterns = [
    /\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i,
    /\b\d{1,2}\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{4}\b/i
  ];
  for (let p of patterns) {
    const match = text.match(p);
    if (match) return match[0];
  }
  return null;
}

// ==========================
// CHUNKING HELPER
// ==========================
function chunkText(text, chunkSize = 1500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// ==========================
// AI SUMMARY
// ==========================
async function generateSummary(text) {
  text = text.replace(/THE HANSARD[\s\S]+?COMMUNICATION FROM THE CHAIR/i, "");
  text = text.replace(/(Disclaimer|National Assembly Debates|Electronic version|Hansard Editor)/gi, "");

  const chunks = chunkText(text, 1500);
  let summaries = [];

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    try {
      const res = await summarizer(c, { min_length: 50, max_length: 130 });
      if (res && res[0] && res[0].summary_text) summaries.push(res[0].summary_text);

      // Update progress for summarization
      const sumPercent = Math.round(((i + 1) / chunks.length) * 100);
      progressBar.style.width = sumPercent + "%";
      progressBar.innerText = `Summarizing: ${sumPercent}%`;
    } catch (err) {
      console.warn("Chunk summary failed:", err);
    }
  }

  return summaries.length > 0 ? summaries.join(" ") : "No summary available.";
}

// ==========================
// DISPLAY
// ==========================
function displayResult(doc) {
  const card = document.createElement("div");
  card.style.border = "1px solid #ccc";
  card.style.padding = "15px";
  card.style.marginBottom = "15px";
  card.style.borderRadius = "8px";

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
