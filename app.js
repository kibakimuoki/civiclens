// Load existing summaries from JSON
async function loadSummaries() {
  try {
    const response = await fetch('summaries.json');
    const summaries = await response.json();
    const container = document.getElementById('summary-container');
    container.innerHTML = '';

    summaries.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'summary-card';
      card.innerHTML = `
        <h3>${doc.title}</h3>
        <p><strong>Date:</strong> ${doc.date || 'N/A'}</p>
        <p><strong>Sector:</strong> ${doc.sector || 'N/A'}</p>
        <p>${doc.summary}</p>
        <a href="${doc.source_file}" target="_blank">View Source</a>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading summaries:', err);
  }
}

// PDF summarization (client-side)
async function summarizePDF(file) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://mozilla.github.io/pdf.js/build/pdf.worker.js';
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }

  return simpleSummarizer(fullText);
}

// Simple summarizer (extract first 3 sentences)
function simpleSummarizer(text) {
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];
  return sentences.slice(0, 3).join(' ');
}

// Handle PDF uploads
const pdfInput = document.getElementById('pdf-upload');
pdfInput.addEventListener('change', async (event) => {
  const container = document.getElementById('uploaded-summaries');
  container.innerHTML = '';

  const files = Array.from(event.target.files);
  for (const file of files) {
    const summary = await summarizePDF(file);
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <h3>${file.name}</h3>
      <p><strong>Summary:</strong> ${summary}</p>
    `;
    container.appendChild(card);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', loadSummaries);
