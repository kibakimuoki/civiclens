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
      summarizer = await pipeline("summarization", "Xenova/t5-small");
    } catch (err) {
      status.innerText = "Failed to load AI model: " + err.message;
      return;
    }
  }

  const totalFiles = uploadedFiles.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = uploadedFiles[i];
    try {
      status.innerText = `Processing file ${i + 1}/${totalFiles}: ${file.name}`;
      const rawText = await extractText(file, i, totalFiles);
      console.log(`Extracted text length for ${file.name}:`, rawText.length);
      console.log(rawText.slice(0, 500)); // preview first 500 characters

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

    const percent = Math.round(((i + 1) / totalFiles) * 100);
    progressBar.style.width = percent + "%";
    progressBar.innerText = percent + "%";
  }

  status.innerText = "Done.";
  uploadedFiles = [];
  fileInput.value = "";
});

// ==========================
// TEXT EXTRACTION
// ==========================
async function extractText(file, fileIndex = 0, totalFiles = 1) {
  if (file.type === "application/pdf") {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = content.items.map(item => item.str).join(" ").trim();

      // Only use OCR if page is truly empty
      if (!pageText) {
        console.log(`Page ${i} empty, running OCR...`);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;

        document.body.appendChild(canvas); // attach canvas temporarily
        try {
          const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
          const ocrText = text.trim();
          if (ocrText) pageText = ocrText;
          console.log(`OCR text length: ${ocrText.length}`);
        } catch (err) {
          console.warn(`OCR failed for page ${i}:`, err);
        }
        document.body.removeChild(canvas);
      }

      fullText += pageText + " ";

      const pagePercent = Math.round((i / pdf.numPages) * 100);
      progressBar.style.width = pagePercent + "%";
      progressBar.innerText = `File ${fileIndex + 1}/${totalFiles}: ${pagePercent}%`;
    }

    return fullText.trim();
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

  let summary = text && text.length > 0 ? text.substring(0, 300) + "..." : "No summary available.";

  try {
    const aiSummary = await generateSummary(text);
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
  if (lower.includes("defence") || lower.includes("security") || lower.includes("army")) return "Security";
  if (lower.includes("finance") || lower.includes("treasury") || lower.includes("budget")) return "Finance";
  if (lower.includes("education")) return "Education";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("health")) return "Health";
  return "General Governance";
}

// ==========================
// AI SUMMARY
// ==========================
async function generateSummary(text) {
  text = text.replace(/THE HANSARD[\s\S]+?COMMUNICATION FROM THE CHAIR/i, "");
  text = text.replace(/(Disclaimer|National Assembly Debates|Electronic version|Hansard Editor)/gi, "");

  const chunks = [];
  const chunkSize = 1500;
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  let summaries = [];

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    try {
      const res = await summarizer(c, { min_length: 50, max_length: 130 });
      if (res && res[0] && res[0].summary_text) summaries.push(res[0].summary_text);

      const sumPercent = Math.round(((i + 1) / chunks.length) * 100);
      progressBar.style.width = sumPercent + "%";
      progressBar.innerText = `Summarizing: ${sumPercent}%`;
    } catch (err) {
      console.warn("Chunk summary failed:", err);
    }
  }

  return summaries.length > 0 ? summaries.join(" ") : "";
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
