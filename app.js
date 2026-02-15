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

    const structured = await sendToBackend(cleaned, file.name);
    displayResult(structured);
  }

  uploadedFiles = [];
  fileInput.value = "";
});

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

function cleanText(text) {
  text = text.replace(/(\d+)\s+t\s+h/g, "$1th");
  text = text.replace(/Disclaimer\s*:\s*The electronic version[^.]+\./gi, "");
  text = text.replace(/NATIONAL ASSEMBLY DEBATES/gi, "");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

async function sendToBackend(text, filename) {
  const response = await fetch("/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, filename })
  });

  return await response.json();
}

function displayResult(doc) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <h3>${doc.title}</h3>
    <p><strong>Date:</strong> ${doc.date}</p>
    <p><strong>Sector:</strong> ${doc.sector}</p>
    <p><strong>AI Summary:</strong></p>
    <p>${doc.summary}</p>
    <details>
      <summary>View Extracted Text</summary>
      <p>${doc.extractedText}</p>
    </details>
  `;

  resultsDiv.prepend(card);
}
