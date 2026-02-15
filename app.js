const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const resultsDiv = document.getElementById("results");

let uploadedFiles = [];

// Store uploaded files
fileInput.addEventListener("change", (e) => {
  uploadedFiles = Array.from(e.target.files);
  alert(uploadedFiles.length + " file(s) ready for processing.");
});

// Process button
processBtn.addEventListener("click", async () => {
  if (uploadedFiles.length === 0) {
    alert("Please upload files first.");
    return;
  }

  for (let file of uploadedFiles) {
    const text = await extractText(file);
    const structured = analyzeDocument(text, file.name);
    displayResult(structured);
  }

  uploadedFiles = [];
  fileInput.value = "";
});

// Extract text from PDF or TXT
async function extractText(file) {
  if (file.type === "application/pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

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

// AI-style processing
function analyzeDocument(text, filename) {

  const cleanedText = text.replace(/\s+/g, " ").trim();

  const title = filename.replace(/\.[^/.]+$/, "").replace(/%20/g, " ");

  const dateMatch = cleanedText.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
  const date = dateMatch ? dateMatch[0] : "Not detected";

  const sector = detectSector(cleanedText);

  const summary = generateSummary(cleanedText);

  return {
    title,
    date,
    sector,
    summary,
    fullText: cleanedText.substring(0, 5000) // limit display
  };
}

// Keyword-based sector classification
function detectSector(text) {
  const lower = text.toLowerCase();

  if (lower.includes("security") || lower.includes("defence") || lower.includes("army")) return "Security";
  if (lower.includes("finance") || lower.includes("budget") || lower.includes("tax")) return "Finance";
  if (lower.includes("health") || lower.includes("hospital")) return "Health";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("education") || lower.includes("school")) return "Education";

  return "General Governance";
}

// Simple extractive summarizer
function generateSummary(text) {

  const sentences = text.split(". ");
  const wordFreq = {};
  const stopwords = ["the","and","of","to","in","that","for","on","with","as","by","is","at","this","be","are"];

  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g);

  words.forEach(word => {
    if (!stopwords.includes(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const sentenceScores = sentences.map(sentence => {
    let score = 0;
    const sentenceWords = sentence.toLowerCase().match(/\b[a-z]{4,}\b/g);
    if (!sentenceWords) return 0;

    sentenceWords.forEach(word => {
      if (wordFreq[word]) score += wordFreq[word];
    });

    return score;
  });

  const ranked = sentences
    .map((s, i) => ({ sentence: s, score: sentenceScores[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return ranked.map(r => r.sentence).join(". ") + ".";
}

// Display result card
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
