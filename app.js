// ======================================================
// CIVICLENS v2 — PRODUCTION PIPELINE (STABLE BUILD)
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

let summarizer = null;
let uploadedFiles = [];

// Wait for DOM
document.addEventListener("DOMContentLoaded", () => {

  const fileInput = document.getElementById("fileInput");
  const processBtn = document.getElementById("processBtn");
  const resultsDiv = document.getElementById("results");
  const status = document.getElementById("status");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");

  if (!processBtn) {
    console.error("processBtn not found.");
    return;
  }

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

    // Load model
    if (!summarizer) {
      try {
        summarizer = await pipeline("summarization", "Xenova/distilbart-cnn-6-6");
        status.innerText = "AI model loaded.";
      } catch (err) {
        console.error("Model failed:", err);
        summarizer = null;
        status.innerText = "AI failed. Using fallback summaries.";
      }
    }

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      status.innerText = `Processing ${i + 1}/${uploadedFiles.length}: ${file.name}`;

      try {
        const result = await processSingleFile(file, progressBar);
        displayResult(result, resultsDiv);
      } catch (err) {
        console.error("File failed:", err);
      }
    }

    progressBar.style.width = "100%";
    progressBar.innerText = "100%";
    status.innerText = "Done.";

    uploadedFiles = [];
    fileInput.value = "";
  });
});

// ======================================================
// PROCESS SINGLE FILE
// ======================================================
async function processSingleFile(file, progressBar) {

  const raw = await extractText(file, progressBar);

  if (!raw || raw.trim().length < 80) {
    return {
      title: file.name,
      date: "Unknown",
      sector: "Unknown",
      summary: "CivicLens could not extract meaningful text.",
      fullText: raw || ""
    };
  }

  const cleaned = normalizeWhitespace(raw);
  const date = extractDate(cleaned) || "Not detected";
  const sector = detectSector(cleaned);
  const summary = await generateSummary(cleaned);

  return {
    title: file.name.replace(/\.[^/.]+$/, ""),
    date,
    sector,
    summary,
    fullText: cleaned.slice(0, 8000)
  };
}

// ======================================================
// TEXT EXTRACTION
// ======================================================
async function extractText(file, progressBar) {

  const name = file.name.toLowerCase();

  if (name.endsWith(".txt")) {
    return await file.text();
  }

  if (name.endsWith(".pdf")) {
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

    return fullText;
  }

  return "";
}

// ======================================================
// NORMALIZATION
// ======================================================
function normalizeWhitespace(text) {
  return text.replace(/\s{2,}/g, " ").trim();
}

// ======================================================
// DATE EXTRACTION
// ======================================================
function extractDate(text) {
  const patterns = [
    /\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i,
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i
  ];

  for (let p of patterns) {
    const match = text.match(p);
    if (match) return match[0];
  }

  return null;
}

// ======================================================
// SECTOR DETECTION
// ======================================================
function detectSector(text) {
  const t = text.toLowerCase();

  const scores = {
    Security: /(security|police|defence|military|terror)/g,
    Finance: /(budget|finance|tax|revenue)/g,
    Education: /(school|education|university)/g,
    Health: /(health|hospital|medical)/g,
    Environment: /(environment|climate|wildlife)/g
  };

  let best = "General Governance";
  let bestScore = 0;

  for (const [sector, regex] of Object.entries(scores)) {
    const count = (t.match(regex) || []).length;
    if (count > bestScore) {
      bestScore = count;
      best = sector;
    }
  }

  return best;
}

// ======================================================
// SUMMARY GENERATION
// ======================================================
async function generateSummary(text) {

  if (!summarizer) {
    return text.slice(0, 400) + "...";
  }

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

    summaries.push(result[0].generated_text);
  }

  return summaries.join(" ").slice(0, 700) + "...";
}

// ======================================================
// HTML ESCAPE
// ======================================================
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ======================================================
// DISPLAY RESULT
// ======================================================
function displayResult(doc, resultsDiv) {

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
