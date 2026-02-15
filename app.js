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
    summarizer = await window.pipeline(
      "summarization",
      "Xenova/distilbart-cnn-6-6"
    );
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

  text = text.replace(/(\d+)\s+t\s+h/g, "$1th");
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/\s+/g, " ");

  return text.trim();
}

// ==========================
// ANALYZE DOCUMENT
// ==========================

async function analyzeDocument(text, filename) {

  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));

  const dateMatch = text.match(
    /\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i
  );

  const date = dateMatch ? dateMatch[0] : "Not detected";

  const sector = detectSector(text);

  const summary = await generateSummary(text);

  return {
    title,
    date,
    sector,
    summary,
    fullText: text.substring(0, 5000)
  };
}

// ==========================
// SECTOR DETECTION
// ==========================

function detectSector(text) {

  const lower = text.toLowerCase();

  if (lower.includes("defence") || lower.includes("security") || lower.includes("army"))
    return "Security";

  if (lower.includes("finance") || lower.includes("treasury") || lower.includes("budget"))
    return "Finance";

  if (lower.includes("education"))
    return "Education";

  if (lower.includes("environment") || lower.includes("nema"))
    return "Environment";

  if (lower.includes("health"))
    return "Health";

  return "General Governance";
}

// ==========================
// AI SUMMARY
// ==========================

async function generateSummary(text) {

  const chunk = text.slice(0, 2000);

  const result = await summarizer(chunk, {
    max_length: 180,
    min_length: 60
  });

  return result[0].summary_text;
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
