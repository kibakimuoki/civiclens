const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const resultsDiv = document.getElementById("results");

let uploadedFiles = [];

fileInput.addEventListener("change", (e) => {
  uploadedFiles = Array.from(e.target.files);
  alert(uploadedFiles.length + " file(s) ready.");
});

processBtn.addEventListener("click", async () => {
  if (uploadedFiles.length === 0) {
    alert("Upload files first.");
    return;
  }

  for (let file of uploadedFiles) {
    const rawText = await extractText(file);
    const cleaned = cleanText(rawText);
    const structured = analyzeDocument(cleaned, file.name);
    displayResult(structured);
  }

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
// CLEANING ENGINE
// ==========================

function cleanText(text) {

  // Fix broken ordinal spacing (4 t h → 4th)
  text = text.replace(/(\d+)\s+t\s+h/g, "$1th");

  // Remove repeated Hansard disclaimers
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");

  // Remove page number headers
  text = text.replace(/\d+\s+December\s+\d{4}\s+NATIONAL ASSEMBLY DEBATES\s+\d+/gi, "");

  // Remove multiple spaces
  text = text.replace(/\s+/g, " ");

  return text.trim();
}

// ==========================
// ANALYSIS
// ==========================

function analyzeDocument(text, filename) {

  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));

  const dateMatch = text.match(/\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
  const date = dateMatch ? dateMatch[0] : "Not detected";

  const sector = detectSector(text);

  const summary = generateSummary(text);

  return {
    title,
    date,
    sector,
    summary,
    fullText: text.substring(0, 8000)
  };
}

// ==========================
// SECTOR CLASSIFICATION
// ==========================

function detectSector(text) {
  const lower = text.toLowerCase();

  if (lower.includes("defence") || lower.includes("security") || lower.includes("army")) return "Security";
  if (lower.includes("finance") || lower.includes("treasury") || lower.includes("budget")) return "Finance";
  if (lower.includes("education") || lower.includes("school")) return "Education";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("health")) return "Health";

  return "General Governance";
}

// ==========================
// IMPROVED SUMMARY ENGINE
// ==========================

function generateSummary(text) {

  const sentences = text.split(/(?<=\.)\s+/);

  const ignorePhrases = [
    "disclaimer",
    "national assembly debates",
    "electronic version",
    "hansard editor"
  ];

  const filtered = sentences.filter(sentence => {
    const lower = sentence.toLowerCase();
    return !ignorePhrases.some(phrase => lower.includes(phrase));
  });

  const important = filtered.slice(0, 8);

  return important.join(" ");
}

// ==========================
// DISPLAY
// ==========================

function displayResult(doc) {

  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h3>${doc.title}</h3>
    <p><strong>Date:</strong> ${doc.date}</p>
    <p><strong>Sector:</strong> ${doc.sector}</p>
    <p><strong>AI Summary:</strong> ${doc.summary}</p>
    <details>
      <summary>View Extracted Text</summary>
      <p>${doc.fullText}</p>
    </details>
    <hr>
  `;

  resultsDiv.prepend(card);
}
