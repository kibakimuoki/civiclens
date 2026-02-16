// ======================================================
// CIVICLENS v2 — PRODUCTION PIPELINE (SINGLE FILE, FULLY UPDATED)
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
        title: file.name.replace(/\.[^/.]+$/, ""),
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
// PROCESS SINGLE FILE
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
  rawText = rawText.replace(/\n+/g, " ").trim(); // collapse line breaks for OCRed text

  // ---------------------------
  // Classify & clean
  // ---------------------------
  const docType = classifyDocument(rawText);
  const cleanedText = cleanByType(rawText, docType);

  // ---------------------------
  // Extract date (filename + text + type-aware)
// ---------------------------
  const date = extractDate(cleanedText, file.name, docType);

  // ---------------------------
  // Detect sector
  // ---------------------------
  const sector = detectSector(cleanedText);

  // ---------------------------
  // Generate summary
  // ---------------------------
  let summary = "";
  try {
    summary = await generateSummary(cleanedText);
  } catch (err) {
    console.error("Summarization failed:", err);
    summary = cleanedText.slice(0, 300) + "...";
  }

  return {
    title: file.name.replace(/\.[^/.]+$/, ""),
    date,
    sector,
    summary,
    fullText: cleanedText.slice(0, 8000)
  };
}

// ======================================================
// OCR TEXT NORMALIZATION
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
    // keep letters, numbers, commas, periods, dashes, colons, slashes, spaces
    .replace(/[^a-zA-Z0-9.,;:/\-\s]/g, " ")
    .replace(/(\d)\s+(\d)/g, "$1$2")
    .replace(/([A-Za-z])\s+([a-z])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ======================================================
// FIX OCR-ERROR DATES
// ======================================================
function fixOCRDate(dateStr) {
  let s = dateStr.replace(/\s{2,}/g, " ").replace(/[^a-zA-Z0-9 ,]/g, "").trim();

  const monthFixes = {
    "JANUARY": "January", "FEBRURY": "February", "FEBRURAY": "February",
    "MARH": "March", "APIL": "April", "JUNE": "June", "JULY": "July",
    "AUGUST": "August", "SEPTEMBER": "September", "OCTOBER": "October",
    "NOVEMBER": "November", "DECEMBER": "December", "DECEMBR": "December",
    "DECMEBER": "December"
  };
  for (let [wrong, correct] of Object.entries(monthFixes)) {
    const regex = new RegExp(wrong, "i");
    s = s.replace(regex, correct);
  }

  s = s.replace(/\b(\d{4})\b/g, (y) => {
    const num = parseInt(y);
    if (num < 2000 || num > 2030) return "2025";
    return y;
  });

  return s;
}

// ======================================================
// CLEAN BY TYPE
// ======================================================
function cleanByType(text, type) {
  let t = text.trim();

  switch (type) {
    case "bill": t = cleanBill(t); break;
    case "hansard": t = cleanHansard(t); break;
    case "order_paper": t = cleanOrderPaper(t); break;
    case "committee_report": t = cleanCommitteeReport(t); break;
    case "gazette": t = cleanGazette(t); break;
  }

  t = t.replace(/\bPage\s*\d+\b/gi, "");
  t = t.replace(/\b\d{3,4}\b/g, "");
  return t.trim();
}

function cleanBill(text) {
  return text
    .replace(/REPUBLIC OF KENYA[\s\S]{0,200}/gi, "")
    .replace(/ARRANGEMENT OF CLAUSES[\s\S]{0,2000}/gi, "")
    .replace(/OBJECTS AND REASONS[\s\S]{0,2000}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanHansard(text) {
  return text
    // Remove disclaimer block
    .replace(/Disclaimer[\s\S]{0,500}?Hansard Editor\./gi, "")

    // Normalize header
    .replace(/THE HANSARD[\s\S]{0,200}?The House met/gi, "The House met")

    // Remove stage directions like [Applause] or [Laughter]
    .replace(/\[\s*Applause\s*\]/gi, "")
    .replace(/\[\s*Laughter\s*\]/gi, "")

    // Remove quorum bell note
    .replace(/\(The Quorum Bell was rung\)/gi, "")

    // Remove volume numbering
    .replace(/Vol\.\s*[IVXLC]+\s*No\.\s*\d+/gi, "")

    // Clean extra whitespace
    .replace(/\s{2,}/g, " ")
    .trim();
}


function cleanOrderPaper(text) {
  return text
    .replace(/REPUBLIC OF KENYA[\s\S]{0,200}/gi, "")
    .replace(/ORDERS OF THE DAY[\s\S]{0,200}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanCommitteeReport(text) {
  return text
    .replace(/REPUBLIC OF KENYA[\s\S]{0,200}/gi, "")
    .replace(/REPORT OF THE[\s\S]{0,300}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanGazette(text) {
  return text
    .replace(/SPECIAL ISSUE[\s\S]{0,400}/gi, "")
    .replace(/Kenya Gazette Supplement[\s\S]{0,400}/gi, "")
    .replace(/NATIONAL ASSEMBLY RECEIVED[\s\S]{0,200}/gi, "")
    .replace(/DIRECTOR LEGAL SERVICES[\s\S]{0,200}/gi, "")
    .replace(/PRINTED AND PUBLISHED BY[\s\S]{0,200}/gi, "")
    .replace(/\b\d{3,4}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

// === TXT ===
async function extractFromTXT(file) {
  const text = await file.text();
  return { success: text.trim().length > 0, rawText: text };
}

// === IMAGE ===
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

// === PDF ===
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

      let pageText = "";

      // Try native text extraction first
      try {
        const content = await page.getTextContent();
        pageText = content.items.map(item => item.str).join(" ").trim();
      } catch (err) {
        console.warn("Text extraction failed on page, will try OCR if allowed:", err);
        pageText = "";
      }

      // Fallback to OCR if text is too short or corrupted
      if ((pageText.length < 100 || /[\uFFFD]/.test(pageText)) && ocrUsed < MAX_OCR_PAGES) {
        ocrUsed++;
        pageText = await ocrPage(page);
      }

      fullText += (pageText || "") + "\n";

      if (fullText.length > MAX_TOTAL_CHARS) break;

      const percent = Math.round((i / pdf.numPages) * 100);
      progressBar.style.width = percent + "%";
      progressBar.innerText = `Extracting: ${percent}%`;
    } catch (err) {
      console.warn("PDF page failed:", err);
      // continue to next page
    }
  }

  // Mark success as true if we got any text at all
  return { success: fullText.trim().length > 10, rawText: fullText };
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
// CLASSIFICATION
// ======================================================
function classifyDocument(text) {
  const t = text.toLowerCase();
  if (/a bill for|arrangement of clauses|objects and reasons|enacted by/i.test(t)) return "bill";
  if (/the house met|hansard|speaker|hon\./i.test(t)) return "hansard";
  if (/order of business|order paper|prayers/i.test(t)) return "order_paper";
  if (/committee on|departmental committee|report of/i.test(t)) return "committee_report";
  if (/kenya gazette|gazette notice/i.test(t)) return "gazette";
  return "general";
}

// ======================================================
// DATE EXTRACTION (IMPROVED)
// ======================================================
function extractDateFromFilename(name) {
  const decoded = decodeURIComponent(name).replace(/\.[^/.]+$/, "");

  let m = decoded.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/i);
  if (m) return fixOCRDate(m[0]);

  m = decoded.match(/\b[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i);
  if (m) return fixOCRDate(m[0]);

  m = decoded.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/i);
  if (m) {
    const cleaned = m[0].replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i, "");
    return fixOCRDate(cleaned);
  }

  m = decoded.match(/\b(20[0-3]\d)\b/);
  if (m) return m[0];

  return null;
}

function extractDateFromText(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();

  const patterns = [
    /\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/i,
    /\b[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i,
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/i,
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/i
  ];

  for (const p of patterns) {
    const match = cleaned.match(p);
    if (match) {
      let s = match[0];
      s = s.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i, "");
      return fixOCRDate(s);
    }
  }

  return null;
}

function extractDate(text, filename, docType) {
  const fromName = extractDateFromFilename(filename);
  if (fromName) return fromName;

  const fromText = extractDateFromText(text);
  if (fromText) return fromText;

  const firstLine = text.split("\n")[0];

  if (docType === "hansard" || docType === "order_paper") {
    const m = firstLine.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4}\b/i);
    if (m) return fixOCRDate(m[0]);
  }

  return "Not detected";
}

// ======================================================
// SECTOR DETECTION (SLIGHTLY ENRICHED)
// ======================================================
function detectSector(text) {
  const t = text.toLowerCase();
  const sectors = {
    Security: /(security|police|defence|defense|military|immigration|citizenship|criminal|terror|counter[- ]terrorism)/g,
    Finance: /(budget|appropriation|finance|tax|revenue|expenditure|treasury|levy|duty|customs)/g,
    Education: /(education|school|university|teacher|curriculum|academy|student|learner)/g,
    Health: /(health|hospital|clinic|disease|medical|public health|immunization|vaccine)/g,
    Environment: /(environment|climate|wildlife|forest|forestry|pollution|conservation|biodiversity)/g,
    Justice: /(judiciary|court|legal|procedure|contract|law|tribunal|appeal|magistrate)/g,
    CreativeEconomy: /(creative economy|film|music|arts|culture|copyright|intellectual property|performing arts)/g
  };

  let best = "General Governance";
  let maxScore = 0;

  for (const [name, regex] of Object.entries(sectors)) {
    const matches = t.match(regex);
    const score = matches ? matches.length : 0;
    if (score > maxScore) {
      maxScore = score;
      best = name === "CreativeEconomy" ? "Creative Economy" : name;
    }
  }

  return best;
}

// ======================================================
// SUMMARIZATION
// ======================================================
async function generateSummary(text) {
  if (!text || text.length < 200 || !summarizer) return text.slice(0, 300) + "...";

  try {
    return await summarizeInChunks(text);
  } catch (err) {
    console.error("Chunked summarization failed:", err);
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

    const summary = result?.[0]?.summary_text || result?.[0]?.generated_text || "";
    if (summary.trim().length > 20) summaries.push(summary.trim());
  }

  if (!summaries.length) return text.slice(0, 300) + "...";

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
      <pre>${escapeHTML(doc.fullText)}</pre>
    </details>
  `;

  resultsDiv.append(card);
}
