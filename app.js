// ======================================================
// CIVICLENS v2 — PRODUCTION PIPELINE (DROP-IN REPLACEMENT)
// ======================================================

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";
// REQUIRED FOR PDF.JS TO WORK PROPERLY
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
// DOM ELEMENTS
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
      status.innerText = "AI model loaded.";
    } catch (err) {
      console.error("AI model failed:", err);
      status.innerText = "AI model failed. Using fallback summaries.";
      summarizer = null;
    }
  }

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    status.innerText = `Processing file ${i + 1}/${uploadedFiles.length}: ${file.name}`;

    try {
      const result = await processSingleFile(file);
      displayResult(result);
    } catch (err) {
      console.error("Error processing file:", file.name, err);
      displayResult({
        title: file.name,
        date: "Unknown",
        sector: "Unknown",
        summary: "CivicLens encountered an error while processing this file.",
        fullText: ""
      });
    }
  }

  status.innerText = "Done.";
  uploadedFiles = [];
  fileInput.value = "";
  progressBar.style.width = "100%";
  progressBar.innerText = "100%";
});

// ======================================================
// PROCESS SINGLE FILE — IMPROVED
// ======================================================
async function processSingleFile(file) {
  const fileType = detectFileType(file);
  const extraction = await extractTextFromFile(file, fileType);

  let rawText = extraction.rawText || "";

  if (!extraction.success || rawText.trim().length < 80) {
    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      date: "Unknown",
      sector: "Unknown",
      summary: "CivicLens could not extract meaningful text from this document.",
      fullText: rawText.slice(0, 500)
    };
  }

  // ---------------------------
  // Normalize OCR / whitespace
  // ---------------------------
  rawText = normalizeWhitespace(rawText);
  rawText = normalizeOCRText(rawText);

  // ---------------------------
  // Classify & clean
  // ---------------------------
  const docType = classifyDocument(rawText);
  const cleanedText = cleanByType(rawText, docType);

  // ---------------------------
  // Extract date
  // ---------------------------
  let date = extractDate(cleanedText);
  if (date) date = fixOCRDate(date);

  // ---------------------------
  // Detect sector
  // ---------------------------
  const sector = detectSector(cleanedText);

  // ---------------------------
  // Generate summary
  // ---------------------------
  const summary = await generateSummary(cleanedText);

  return {
    title: file.name.replace(/\.[^/.]+$/, ""),
    date: date || "Not detected",
    sector,
    summary,
    fullText: cleanedText.slice(0, 8000)
  };
}

// ======================================================
// OCR TEXT NORMALIZATION
// ======================================================
function normalizeOCRText(text) {
  return text
    .replace(/[^a-zA-Z0-9.,;:\s]/g, " ")  // remove stray symbols
    .replace(/\s{2,}/g, " ")              // collapse multiple spaces
    .replace(/(\d)\s+(\d)/g, "$1$2")      // merge split numbers
    .replace(/([A-Za-z])\s+([A-Za-z])/g, "$1$2") // merge split words
    .trim();
}

// ======================================================
// FIX OCR-ERROR DATES
// ======================================================
function fixOCRDate(dateStr) {
  // Remove extra spaces / OCR artifacts
  let s = dateStr.replace(/\s{2,}/g, " ").replace(/[^a-zA-Z0-9 ,]/g, "").trim();

  // Correct common OCR errors in months
  const monthFixes = {
    "JANUARY": "January", "FEBRURY": "February", "FEBRURAY": "February",
    "MARH": "March", "APIL": "April", "JUNE": "June", "JULY": "July",
    "AUGUST": "August", "SEPTEMBER": "September", "OCTOBER": "October",
    "NOVEMBER": "November", "DECEMBER": "December"
  };
  for (let [wrong, correct] of Object.entries(monthFixes)) {
    const regex = new RegExp(wrong, "i");
    s = s.replace(regex, correct);
  }

  // Clamp year if OCR misread it (e.g., 2033 → 2025)
  s = s.replace(/\b(\d{4})\b/g, (y) => {
    const num = parseInt(y);
    if (num < 2000 || num > 2030) return "2025";
    return y;
  });

  return s;
}

// ======================================================
// CLEAN BY TYPE — ADDITIONAL OCR AGGRESSIVE CLEANUP
// ======================================================
function cleanByType(text, type) {
  let t = text.trim();

  switch (type) {
    case "bill":
      t = cleanBill(t);
      break;
    case "hansard":
      t = cleanHansard(t);
      break;
    case "order_paper":
      t = cleanOrderPaper(t);
      break;
    case "committee_report":
      t = cleanCommitteeReport(t);
      break;
    case "gazette":
      t = cleanGazette(t);
      break;
    default:
      t = t.replace(/\s{2,}/g, " ");
  }

  // remove stray page numbers or headers
  t = t.replace(/\bPage\s*\d+\b/gi, "");
  t = t.replace(/\b\d{3,4}\b/g, ""); // standalone numbers
  return t.trim();
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
  try {
    if (type === "pdf") return await extractFromPDF(file);
    if (type === "txt") return await extractFromTXT(file);
    if (type === "image") return await extractFromImage(file);
    return { success: false, rawText: "" };
  } catch (err) {
    console.error("Extraction error:", err);
    return { success: false, rawText: "" };
  }
}

async function extractFromTXT(file) {
  const text = await file.text();
  return { success: text.trim().length > 0, rawText: text };
}

async function extractFromImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const ocr = await Tesseract.recognize(canvas, "eng");
  return { success: ocr.data.text.trim().length > 30, rawText: ocr.data.text };
}

async function extractFromPDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = "";
  let ocrUsed = 0;
  const MAX_OCR_PAGES = 8;
  const MAX_TOTAL_CHARS = 20000;

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map(item => item.str).join(" ").trim();

      if (pageText.length < 40 && ocrUsed < MAX_OCR_PAGES) {
        ocrUsed++;
        pageText = await ocrPage(page);
      }

      fullText += pageText + "\n";
      if (fullText.length > MAX_TOTAL_CHARS) break;

      const percent = Math.round((i / pdf.numPages) * 100);
      progressBar.style.width = percent + "%";
      progressBar.innerText = `Extracting: ${percent}%`;
    } catch (err) {
      console.warn("PDF page failed:", err);
    }
  }

  return { success: fullText.trim().length > 50, rawText: fullText };
}

async function ocrPage(page) {
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const ocr = await Tesseract.recognize(canvas, "eng");
  return ocr.data.text.trim();
}

// ======================================================
// CLEANING + CLASSIFICATION
// ======================================================
function normalizeWhitespace(text) {
  return text.replace(/\s{2,}/g, " ").trim();
}

function normalizeOCRText(text) {
  return text
    .replace(/[^a-zA-Z0-9.,;:\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/(\w)\s+(\w)/g, "$1 $2")
    .trim();
}

function classifyDocument(text) {
  const t = text.toLowerCase();

  if (/a bill for|arrangement of clauses|objects and reasons|enacted by/i.test(t))
    return "bill";

  if (/the house met|hansard|speaker|hon\./i.test(t))
    return "hansard";

  if (/order of business|order paper|prayers/i.test(t))
    return "order_paper";

  if (/committee on|departmental committee|report of/i.test(t))
    return "committee_report";

  if (/kenya gazette|gazette notice/i.test(t))
    return "gazette";

  return "general";
}

function cleanByType(text, type) {
  switch (type) {
    case "bill": return cleanBill(text);
    case "hansard": return cleanHansard(text);
    case "order_paper": return cleanOrderPaper(text);
    case "committee_report": return cleanCommitteeReport(text);
    case "gazette": return cleanGazette(text);
    default: return text.trim();
  }
}

function cleanBill(text) {
  return text
    .replace(/REPUBLIC OF KENYA[\s\S]{0,200}/gi, "")
    .replace(/ARRANGEMENT OF CLAUSES[\s\S]{0,2000}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanHansard(text) {
  return text
    .replace(/Disclaimer[\s\S]{0,500}?Hansard Editor\./gi, "")
    .replace(/THE HANSARD[\s\S]{0,200}?The House met/gi, "The House met")
    .replace(/\[\s*Applause\s*\]/gi, "")
    .replace(/\[\s*Laughter\s*\]/gi, "")
    .replace(/\(The Quorum Bell was rung\)/gi, "")
    .replace(/Vol\.\s*[IVXLC]+\s*No\.\s*\d+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanOrderPaper(text) {
  return text.replace(/\s{2,}/g, " ").trim();
}

function cleanCommitteeReport(text) {
  return text.replace(/\s{2,}/g, " ").trim();
}

function cleanGazette(text) {
  return text
    .replace(/SPECIAL ISSUE[\s\S]{0,400}/gi, "")
    .replace(/Kenya Gazette Supplement[\s\S]{0,400}/gi, "")
    .replace(/NATIONAL ASSEMBLY RECEIVED[\s\S]{0,200}/gi, "")
    .replace(/DIRECTOR LEGAL SERVICES[\s\S]{0,200}/gi, "")
    .replace(/PRINTED AND PUBLISHED BY[\s\S]{0,200}/gi, "")
    .replace(/\b\d{3,4}\b/g, "") // remove standalone page numbers
    .replace(/\s{2,}/g, " ")
    .trim();
}


// ======================================================
// DATE EXTRACTION (FIXED)
// ======================================================
function extractDate(text) {
  const cleaned = text.replace(/\s+/g, " ");

  const patterns = [
    /\b\d{1,2}\s*(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i,
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i
  ];

  for (let p of patterns) {
    const match = cleaned.match(p);
    if (match) return match[0];
  }

  return null;
}

// ======================================================
// SECTOR DETECTION (FIXED)
// ======================================================
function detectSector(text) {
  const t = text.toLowerCase();

  const sectors = {
    Security: /(security|police|defence|military|immigration|citizenship|criminal|terror)/g,
    Finance: /(budget|appropriation|finance|tax|revenue|expenditure|treasury)/g,
    Education: /(education|school|university|teacher|curriculum|academy)/g,
    Health: /(health|hospital|clinic|disease|medical|public health)/g,
    Environment: /(environment|climate|wildlife|forest|forestry|pollution)/g,
    Justice: /(judiciary|court|legal|procedure|contract|law)/g
  };

  let best = "General Governance";
  let maxScore = 0;

  for (const [name, regex] of Object.entries(sectors)) {
    const matches = t.match(regex);
    const score = matches ? matches.length : 0;
    if (score > maxScore) {
      maxScore = score;
      best = name;
    }
  }

  return best;
}

// ======================================================
// SUMMARIZATION
// ======================================================
async function generateSummary(text) {
  if (!text || text.length < 200 || !summarizer)
    return text.slice(0, 300) + "...";

  try {
    return await summarizeInChunks(text);
  } catch {
    return text.slice(0, 300) + "...";
  }
}

async function summarizeInChunks(text) {
  const CHUNK_SIZE = 1500;
  const summaries = [];

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const chunk = text.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 200) continue;

    const result = await summarizer(chunk, {
      max_new_tokens: 180,
      min_length: 60,
      do_sample: false
    });

    const summary =
      result?.[0]?.summary_text ||
      result?.[0]?.generated_text ||
      "";

    if (summary.trim().length > 20)
      summaries.push(summary.trim());
  }

  if (!summaries.length)
    return text.slice(0, 300) + "...";

  return summaries.join(" ");
 
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
  document.getElementById("placeholder")?.remove();

  const card = document.createElement("div");
  card.className = "summary-card";

  card.innerHTML = `
    <h3>${escapeHTML(doc.title)}</h3>
    <p><strong>Date:</strong> ${escapeHTML(doc.date)}</p>
    <p><strong>Sector:</strong> ${escapeHTML(doc.sector)}</p>
    <p><strong>AI Summary:</strong> ${escapeHTML(doc.summary)}</p>
    <details>
      <summary>View Extracted Text</summary>
      <p>${escapeHTML(doc.fullText)}</p>
    </details>
  `;

  resultsDiv.append(card);
}
