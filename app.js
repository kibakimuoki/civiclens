// ======================================================
// CIVICLENS v2 — PRODUCTION PIPELINE (DROP-IN REPLACEMENT)
// ======================================================

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";

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

  // --------------------------
  // LOAD SUMMARIZER
  // --------------------------
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

  // --------------------------
  // PROCESS EACH FILE
  // --------------------------
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
// MODULE: PROCESS SINGLE FILE
// ======================================================
async function processSingleFile(file) {
  const fileType = detectFileType(file);

  // 1. Extract raw text
  const extraction = await extractTextFromFile(file, fileType);

  if (!extraction.success || extraction.rawText.trim().length < 80) {
    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      date: "Unknown",
      sector: "Unknown",
      summary: "CivicLens could not extract meaningful text from this document.",
      fullText: extraction.rawText.slice(0, 500)
    };
  }

  const raw = extraction.rawText;

  // 2. Normalize whitespace early
  const normalized = normalizeWhitespace(raw);

  // 3. Classify document type
  const docType = classifyDocument(normalized);

  // 4. Type-specific cleaning
  const cleaned = cleanByType(normalized, docType);

  // 5. Metadata extraction
  const title = file.name.replace(/\.[^/.]+$/, "");
  const date = extractDate(cleaned) || "Not detected";
  const sector = detectSector(cleaned);

  // 6. Summarization
  const summary = await generateSummary(cleaned);

  return {
    title,
    date,
    sector,
    summary,
    fullText: cleaned.slice(0, 8000)
  };
}

function detectFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".txt")) return "txt";
  if (file.type.startsWith("image/")) return "image";
  return "unknown";
}

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
  return {
    success: text.trim().length > 0,
    rawText: text
  };
}

async function extractFromImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const ocr = await Tesseract.recognize(canvas, "eng");

  return {
    success: ocr.data.text.trim().length > 30,
    rawText: ocr.data.text
  };
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

      // If PDF text layer is empty → OCR fallback
      if (pageText.length < 40 && ocrUsed < MAX_OCR_PAGES) {
        ocrUsed++;
        pageText = await ocrPage(page);
      }

      fullText += pageText + "\n";

      // Hard limit to prevent runaway extraction
      if (fullText.length > MAX_TOTAL_CHARS) break;

      // Update progress bar
      const percent = Math.round((i / pdf.numPages) * 100);
      progressBar.style.width = percent + "%";
      progressBar.innerText = `Extracting: ${percent}%`;

    } catch (err) {
      console.warn("PDF page failed:", err);
    }
  }

  return {
    success: fullText.trim().length > 50,
    rawText: fullText
  };
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


function normalizeWhitespace(text) {
  return text.replace(/\s{2,}/g, " ").trim();
}


// ======================================================
// MODULE: DOCUMENT TYPE CLASSIFIER
// ======================================================
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


// ======================================================
// MODULE: TYPE-SPECIFIC CLEANING ROUTER
// ======================================================
function cleanByType(text, type) {
  switch (type) {
    case "bill":
      return cleanBill(text);
    case "hansard":
      return cleanHansard(text);
    case "order_paper":
      return cleanOrderPaper(text);
    case "committee_report":
      return cleanCommitteeReport(text);
    case "gazette":
      return cleanGazette(text);
    default:
      return cleanGeneral(text);
  }
}


function cleanBill(text) {
  return text
    .replace(/REPUBLIC OF KENYA[\s\S]{0,200}/gi, "")
    .replace(/NATIONAL ASSEMBLY RECEIVED[\s\S]{0,200}/gi, "")
    .replace(/ARRANGEMENT OF CLAUSES[\s\S]{0,2000}/gi, "")
    .replace(/FIRST SCHEDULE[\s\S]{0,2000}/gi, "")
    .replace(/SECOND SCHEDULE[\s\S]{0,2000}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function cleanHansard(text) {
  return text
    .replace(/Disclaimer\s*:\s*The electronic version[\s\S]{0,300}/gi, "")
    .replace(/

\[\s*Applause\s*\]

/gi, "")
    .replace(/

\[\s*Laughter\s*\]

/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function cleanOrderPaper(text) {
  return text
    .replace(/PRAYERS[\s\S]{0,200}/gi, "")
    .replace(/COMMUNICATION FROM THE CHAIR[\s\S]{0,500}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanCommitteeReport(text) {
  return text
    .replace(/TABLE OF CONTENTS[\s\S]{0,2000}/gi, "")
    .replace(/ACKNOWLEDGEMENT[\s\S]{0,2000}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanGazette(text) {
  return text
    .replace(/GAZETTE NOTICE NO\.[\s\S]{0,200}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}


function cleanGeneral(text) {
  return text
    .replace(/\s{2,}/g, " ")
    .trim();
}


function normalizeOCRText(text) {
  return text
    .replace(/[^a-zA-Z0-9.,;:\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/(\w)\s+(\w)/g, "$1 $2")
    .trim();
}


// ======================================================
// MODULE: TITLE EXTRACTION
// ======================================================
function extractTitle(filename) {
  return decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
}


// ======================================================
// MODULE: DATE EXTRACTION
// ======================================================
function extractDate(text) {
  const cleaned = text.replace(/\s+/g, " ");

  const patterns = [
    // 12th February 2026
    /\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,

    // February 12, 2026
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i,

    // 12 Feb 2026
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i,

    // 12 FEBRUARY 2026
    /\b\d{1,2}\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{4}\b/i
  ];

  for (let p of patterns) {
    const match = cleaned.match(p);
    if (match) return match[0];
  }

  return null;
}

// ======================================================
// MODULE: SECTOR DETECTION
// ======================================================
function detectSector(text) {
  const t = text.toLowerCase();

  const scores = {
    Security: /(security|police|defence|military|intelligence|terror)/g,
    Finance: /(budget|appropriation|finance|tax|revenue|expenditure)/g,
    Education: /(school|education|university|teacher|curriculum)/g,
    Health: /(health|hospital|clinic|disease|medical|public health)/g,
    Environment: /(environment|climate|wildlife|forestry|pollution)/g
  };

  let bestSector = "General Governance";
  let bestScore = 0;

  for (const [sector, regex] of Object.entries(scores)) {
    const count = (t.match(regex) || []).length;
    if (count > bestScore) {
      bestScore = count;
      bestSector = sector;
    }
  }

  return bestSector;
}


// ======================================================
// MODULE: METADATA ASSEMBLY
// ======================================================
function extractMetadata(cleanedText, filename) {
  return {
    title: extractTitle(filename),
    date: extractDate(cleanedText) || "Not detected",
    sector: detectSector(cleanedText)
  };
}


// ======================================================
// MODULE: SUMMARY GENERATION (MAIN ENTRY POINT)
// ======================================================
async function generateSummary(text) {
  // Fallback for very short documents
  if (!text || text.length < 200) {
    return text.slice(0, 300) + "...";
  }

  // If model failed to load
  if (!summarizer) {
    return text.slice(0, 300) + "...";
  }

  try {
    return await summarizeInChunks(text);
  } catch (err) {
    console.warn("Summarization failed:", err);
    return text.slice(0, 300) + "...";
  }
}


// ======================================================
// MODULE: CHUNKED SUMMARIZATION ENGINE
// ======================================================
async function summarizeInChunks(text) {
  const CHUNK_SIZE = 1500;     // safe for DistilBART
  const MIN_CHUNK = 200;       // avoid garbage
  const summaries = [];

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const chunk = text.slice(i, i + CHUNK_SIZE);

    // Skip tiny chunks
    if (chunk.length < MIN_CHUNK) continue;

    const result = await summarizer(chunk, {
      max_new_tokens: 180,
      min_length: 60,
      do_sample: false
    });

    const summary = result?.[0]?.generated_text || "";
    if (summary.trim().length > 20) {
      summaries.push(summary.trim());
    }
  }

  // If no summaries were produced
  if (summaries.length === 0) {
    return text.slice(0, 300) + "...";
  }

  // Merge summaries into a final output
  return mergeSummaries(summaries);
}

// ======================================================
// MODULE: SUMMARY MERGER
// ======================================================
function mergeSummaries(parts) {
  const merged = parts.join(" ");

  // Final safety trim
  return merged.slice(0, 600) + "...";
}


// ======================================================
// MODULE: SAFE HTML ESCAPE
// ======================================================
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ======================================================
// MODULE: SUMMARY CARD RENDERING
// ======================================================
function displayResult(doc) {
  // Remove placeholder if present
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

  // Append in correct order (no more prepend confusion)
  resultsDiv.append(card);
}


function clearResults() {
  resultsDiv.innerHTML = "";
}





