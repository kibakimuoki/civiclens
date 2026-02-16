// ======================================================
// CIVICLENS v2 — PRODUCTION PIPELINE (FULLY RECTIFIED)
// ======================================================

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";

// REQUIRED FOR PDF.JS
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

// --------------------------
// MODEL SETTINGS
// --------------------------
env.localModelPath = null;
env.allowLocalModels = false;
env.remoteModels = true;
env.backends.onnx.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1/dist/";
env.backends.onnx.wasm.proxy = false;

// --------------------------
// DOM
// --------------------------
const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const resultsDiv = document.getElementById("results");
const status = document.getElementById("status");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");

let uploadedFiles = [];
let summarizer = null;

// ======================================================
// FILE SELECTION
// ======================================================
fileInput.addEventListener("change", (e) => {
  uploadedFiles = Array.from(e.target.files);
  status.innerText = `${uploadedFiles.length} file(s) ready.`;
});

// ======================================================
// PROCESS BUTTON
// ======================================================
processBtn.addEventListener("click", async () => {
  if (!uploadedFiles.length) {
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
      status.innerText = "AI model loaded.";
    } catch (err) {
      console.error("Model load failed:", err);
      summarizer = null;
      status.innerText = "AI failed. Using fallback summaries.";
    }
  }

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    status.innerText = `Processing ${i + 1}/${uploadedFiles.length}: ${file.name}`;

    try {
      const result = await processSingleFile(file);
      displayResult(result);
    } catch (err) {
      console.error("File error:", err);
    }
  }

  progressBar.style.width = "100%";
  progressBar.innerText = "100%";
  status.innerText = "Done.";
});

// ======================================================
// PROCESS SINGLE FILE
// ======================================================
async function processSingleFile(file) {
  const fileType = detectFileType(file);
  const extraction = await extractTextFromFile(file, fileType);

  let rawText = extraction.rawText || "";

  if (!extraction.success || rawText.trim().length < 80) {
    return {
      title: stripExtension(file.name),
      date: "Unknown",
      sector: "Unknown",
      summary: "CivicLens could not extract meaningful text.",
      fullText: rawText.slice(0, 500)
    };
  }

  rawText = normalizeWhitespace(rawText);
  rawText = normalizeOCRText(rawText);

  // IMPORTANT: classify before flattening
  const docType = classifyDocument(rawText);

  // Clean while structure exists
  let cleanedText = cleanByType(rawText, docType);

  // Now flatten
  cleanedText = cleanedText.replace(/\n+/g, " ").trim();

  const date = extractDate(cleanedText, file.name);
  let sector = detectSector(cleanedText);

  if (docType === "order_paper" || docType === "hansard") {
    sector = "Parliamentary Proceedings";
  }

  let summary = await generateSummary(cleanedText);

  return {
    title: stripExtension(file.name),
    date,
    sector,
    summary,
    fullText: cleanedText.slice(0, 8000)
  };
}

function stripExtension(name) {
  return decodeURIComponent(name).replace(/\.[^/.]+$/, "");
}

// ======================================================
// NORMALIZATION
// ======================================================
function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeOCRText(text) {
  return text
    .replace(/[^a-zA-Z0-9.,;:/\-\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ======================================================
// CLEANING
// ======================================================
function cleanByType(text, type) {
  switch (type) {
    case "bill":
      return text.replace(/ARRANGEMENT OF CLAUSES[\s\S]{0,2000}/gi, "");
    case "hansard":
      return text
        .replace(/REPUBLIC OF KENYA[\s\S]{0,500}?NATIONAL ASSEMBLY/gi, "")
        .replace(/The House met at[\s\S]{0,300}?PRAYERS/gi, "")
        .replace(/QUORUM[\s\S]{0,500}?business\./gi, "")
        .replace(/\[\s*Applause\s*\]/gi, "")
        .replace(/\[\s*Laughter\s*\]/gi, "");
    case "order_paper":
      return text.replace(/REPUBLIC OF KENYA[\s\S]{0,400}?ORDER OF BUSINESS/gi, "");
    case "gazette":
      return text.replace(/SPECIAL ISSUE[\s\S]{0,400}/gi, "");
    default:
      return text;
  }
}

// ======================================================
// FILE TYPE DETECTION
// ======================================================
function detectFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".txt")) return "txt";
  if (file.type.startsWith("image/")) return "image";
  return "unknown";
}

// ======================================================
// EXTRACTION
// ======================================================
async function extractTextFromFile(file, type) {
  if (type === "pdf") return await extractFromPDF(file);
  if (type === "txt") return { success: true, rawText: await file.text() };
  if (type === "image") return await extractFromImage(file);
  return { success: false, rawText: "" };
}

async function extractFromImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const ocr = await Tesseract.recognize(canvas, "eng");
  return { success: true, rawText: ocr.data.text };
}

async function extractFromPDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(i => i.str).join(" ");
    fullText += pageText + "\n";

    const percent = Math.round((i / pdf.numPages) * 100);
    progressBar.style.width = percent + "%";
    progressBar.innerText = `Extracting: ${percent}%`;
  }

  return { success: true, rawText: fullText };
}

// ======================================================
// CLASSIFICATION
// ======================================================
function classifyDocument(text) {
  const t = text.toLowerCase();
  if (/a bill for|enacted by/i.test(t)) return "bill";
  if (/the house met|hansard|hon\./i.test(t)) return "hansard";
  if (/order of business|order paper/i.test(t)) return "order_paper";
  if (/gazette/i.test(t)) return "gazette";
  return "general";
}

// ======================================================
// DATE EXTRACTION
// ======================================================
function extractDate(text, filename) {
  const fromName = extractDateFromFilename(filename);
  if (fromName) return fromName;

  const match = text.match(
    /\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/i
  );
  if (match) return match[0];

  return "Not detected";
}

function extractDateFromFilename(name) {
  const decoded = stripExtension(name);

  let m = decoded.match(
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}\b/i
  );
  if (m) {
    return m[0].replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i, "");
  }

  m = decoded.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}\b/i);
  if (m) return m[0];

  return null;
}

// ======================================================
// SECTOR DETECTION
// ======================================================
function detectSector(text) {
  const t = text.toLowerCase();

  if (/finance|budget|tax|revenue/i.test(t)) return "Finance";
  if (/health|hospital|medical/i.test(t)) return "Health";
  if (/education|school|university/i.test(t)) return "Education";
  if (/security|police|defence|military/i.test(t)) return "Security";
  if (/environment|climate|wildlife/i.test(t)) return "Environment";

  return "General Governance";
}

// ======================================================
// SUMMARIZATION
// ======================================================
async function generateSummary(text) {
  if (!summarizer || text.length < 200)
    return text.slice(0, 300) + "...";

  const result = await summarizer(text.slice(0, 1500), {
    max_new_tokens: 180,
    min_length: 60,
    do_sample: false
  });

  return result?.[0]?.summary_text || text.slice(0, 300);
}

// ======================================================
// RENDERING
// ======================================================
function escapeHTML(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
}

function displayResult(doc) {
  const card = document.createElement("div");
  card.className = "summary-card";

  card.innerHTML = `
    <h3>${escapeHTML(doc.title)}</h3>
    <p><strong>Date:</strong> ${escapeHTML(doc.date)}</p>
    <p><strong>Sector:</strong> ${escapeHTML(doc.sector)}</p>
    <p><strong>AI Summary:</strong> ${escapeHTML(doc.summary)}</p>
    <details>
      <summary>View Extracted Text</summary>
      <pre>${escapeHTML(doc.fullText)}</pre>
    </details>
  `;

  resultsDiv.append(card);
}
