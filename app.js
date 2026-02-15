import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";

const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const resultsDiv = document.getElementById("results");
const status = document.getElementById("status");

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

  status.innerText = "Loading AI model (first time takes ~20 seconds)...";

  if (!summarizer) {
    summarizer = await pipeline("summarization", "Xenova/t5-small");
  }

  status.innerText = "Processing documents...";

  for (let file of uploadedFiles) {
    const rawText = await extractText(file);
    const cleaned = cleanText(rawText);
    const structured = await analyzeDocument(cleaned, file.name);
    displayResult(structured);
  }

  status.innerText = "Done.";
  uploadedFiles = [];
  fileInput.value = "";
});

// ==========================
// TEXT EXTRACTION
// ==========================
async function extractText(file) {

  if (file.type === "application/pdf") {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(" ");
      fullText += pageText + " ";
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
  text = text.replace(/(\d+)\s+t\s+h/g, "$1th"); // Fix ordinals
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

// ==========================
// ANALYZE DOCUMENT
// ==========================
async function analyzeDocument(text, filename) {

  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  const date = extractDate(text) || "Not detected";
  const docType = detectDocumentType(text);
  const sector = detectSector(text);

  let summary = "No summary available.";

  try {
    summary = await generateSummary(text);
  } catch (err) {
    console.warn("Summary failed:", err);
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
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i
  ];
  for (let p of patterns) {
    const match = text.match(p);
    if (match) return match[0];
  }
  return null;
}

// ==========================
// AI SUMMARY
// ==========================
async function generateSummary(text) {

  // Clean procedural noise
  text = text.replace(/THE HANSARD[\s\S]+?COMMUNICATION FROM THE CHAIR/i, "");
  text = text.replace(/(Disclaimer|National Assembly Debates|Electronic version|Hansard Editor)/gi, "");

  const chunk = text.substring(0, 1500); // Model-safe

  const result = await summarizer(chunk, {
    max_length: 130,
    min_length: 50
  });

  if (result && result[0] && result[0].summary_text) return result[0].summary_text;

  return "No summary available.";
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
