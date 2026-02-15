const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const resultsDiv = document.getElementById("results");
const statusDiv = document.getElementById("status");

let uploadedFiles = [];
let summarizer = null;

// =========================
// FILE UPLOAD
// =========================

fileInput.addEventListener("change", (e) => {
  uploadedFiles = Array.from(e.target.files);
  statusDiv.innerText = uploadedFiles.length + " file(s) ready.";
});

processBtn.addEventListener("click", async () => {
  if (uploadedFiles.length === 0) {
    alert("Upload files first.");
    return;
  }

  for (let file of uploadedFiles) {
    statusDiv.innerText = "Extracting text from " + file.name + "...";

    const rawText = await extractText(file);
    const cleaned = cleanText(rawText);

    statusDiv.innerText = "Running AI summarization... (first time may take 10–20 seconds)";

    const structured = await analyzeDocument(cleaned, file.name);

    displayResult(structured);
  }

  statusDiv.innerText = "Processing complete.";
  uploadedFiles = [];
  fileInput.value = "";
});

// =========================
// TEXT EXTRACTION
// =========================

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

// =========================
// CLEANING ENGINE
// =========================

function cleanText(text) {

  text = text.replace(/(\d+)\s+t\s+h/g, "$1th");
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/\d+\s+December\s+\d{4}\s+NATIONAL ASSEMBLY DEBATES\s+\d+/gi, "");
  text = text.replace(/\s+/g, " ");

  return text.trim();
}

// =========================
// ANALYSIS
// =========================

async function analyzeDocument(text, filename) {

  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));

  const dateMatch = text.match(/\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
  const date = dateMatch ? dateMatch[0] : "Not detected";

  const sector = detectSector(text);

  const summary = await generateSummary(text);

  return {
    title,
    date,
    sector,
    summary,
    fullText: text.substring(0, 6000)
  };
}

// =========================
// SECTOR CLASSIFICATION
// =========================

function detectSector(text) {
  const lower = text.toLowerCase();

  if (lower.includes("defence") || lower.includes("security") || lower.includes("army")) return "Security";
  if (lower.includes("finance") || lower.includes("treasury") || lower.includes("budget")) return "Finance";
  if (lower.includes("education") || lower.includes("school")) return "Education";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("health")) return "Health";

  return "General Governance";
}

// =========================
// REAL AI SUMMARIZATION
// =========================

async function generateSummary(text) {

  if (!summarizer) {
    statusDiv.innerText = "Loading AI model (first time only, ~40MB)...";
    summarizer = await window.transformers.pipeline(
      "summarization",
      "Xenova/distilbart-cnn-6-6"
    );
  }

  const shortened = text.slice(0, 2000);

  const result = await summarizer(shortened, {
    max_length: 160,
    min_length: 60,
  });

  return result[0].summary_text;
}

// =========================
// DISPLAY RESULTS
// =========================

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
