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
// EXTRACT TEXT (PDF + TXT) with OCR + TIMEOUT FIX
// ==========================
async function extractText(file) {
  if (file.type !== "application/pdf") {
    return await file.text();
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  const totalPages = pdf.numPages;

  const overlay = document.getElementById("overlay");
  overlay.style.display = "block";

  const BATCH_SIZE = 3;

  // Timeout helper
  const withTimeout = (promise, ms = 8000) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), ms)
      )
    ]);

  for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
    const batchTasks = [];

    for (let i = batchStart; i <= batchEnd; i++) {
      batchTasks.push(
        (async () => {
          try {
            const page = await withTimeout(pdf.getPage(i));

            let pageText = "";
            try {
              const content = await withTimeout(page.getTextContent());
              pageText = content.items.map(item => item.str).join(" ").trim();
            } catch {
              pageText = "";
            }

            // If text is empty, try OCR
            if (!pageText || pageText.length < 10) {
              try {
                const viewport = page.getViewport({ scale: 1.3 });
                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");

                await withTimeout(
                  page.render({ canvasContext: ctx, viewport }).promise
                );

                const ocr = await withTimeout(
                  Tesseract.recognize(canvas, "eng")
                );
                pageText = ocr.data.text.trim();
              } catch (err) {
                console.warn("OCR failed on page", i, err);
              }
            }

            fullText += pageText + " ";
          } catch (err) {
            console.warn("Page failed:", i, err);
          } finally {
            const percent = Math.round((i / totalPages) * 100);
            progressBar.style.width = percent + "%";
            progressBar.innerText = `Extracting pages: ${percent}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        })()
      );
    }

    await Promise.allSettled(batchTasks);
  }

  overlay.style.display = "none";
  return fullText.trim();
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
// DOCUMENT ANALYSIS
// ==========================
async function analyzeDocument(text, filename) {
  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  const date = extractDate(text) || "Not detected";
  const sector = detectSector(text);

  let summary = text.length > 0 ? text.substring(0, 300) + "..." : "No summary available.";

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
// AI SUMMARY (chunked)
// ==========================
async function generateSummary(text) {
  text = text.replace(/THE HANSARD[\s\S]+?COMMUNICATION FROM THE CHAIR/i, "");
  text = text.replace(/(Disclaimer|National Assembly Debates|Electronic version|Hansard Editor)/gi, "");

  const chunkSize = 400;
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  const summaries = [];
  let stepCounter = 0;
  const totalSteps = chunks.length;

  const summaryPromises = chunks.map(async (chunk, index) => {
    try {
      const res = await summarizer(chunk, { min_length: 50, max_length: 130 });
      summaries[index] = res?.[0]?.summary_text || "";
    } catch (err) {
      console.warn(`Summary failed for chunk ${index}`, err);
      summaries[index] = "";
    } finally {
      stepCounter++;
      const percent = Math.round((stepCounter / totalSteps) * 100);
      progressBar.style.width = percent + "%";
      progressBar.innerText = `Summarizing: ${percent}%`;
      await new Promise(r => setTimeout(r, 0));
    }
  });

  await Promise.allSettled(summaryPromises);
  return summaries.join(" ");
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
