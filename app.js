// Store summaries
let summaries = [];

// Load default dataset
async function loadDataset() {
  try {
    const response = await fetch('summaries.json');
    const data = await response.json();
    summaries.push(...data);
    displaySummaries(summaries);
  } catch (err) {
    console.error('Error loading dataset:', err);
  }
}

// Display summaries
function displaySummaries(list) {
  const container = document.getElementById('summary-cards');
  container.innerHTML = '';
  list.forEach(doc => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <h3>${doc.title}</h3>
      <p><strong>Date:</strong> ${doc.date || 'N/A'}</p>
      <p><strong>Sector:</strong> ${doc.sector || 'N/A'}</p>
      <p>${doc.summary}</p>
      <a href="${doc.source_file || '#'}" target="_blank">View Source</a>
    `;
    container.appendChild(card);
  });
}

// Search functionality
document.getElementById('search-box').addEventListener('input', e => {
  const term = e.target.value.toLowerCase();
  const filtered = summaries.filter(s =>
    s.title.toLowerCase().includes(term) ||
    (s.sector && s.sector.toLowerCase().includes(term)) ||
    (s.summary && s.summary.toLowerCase().includes(term)) ||
    (s.keywords && s.keywords.join(' ').toLowerCase().includes(term))
  );
  displaySummaries(filtered);
});

// Handle PDF uploads
document.getElementById('pdf-upload').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  for (let file of files) {
    const text = await extractPDFText(file);
    const summary = summarizeText(text); // Simple AI placeholder
    const doc = {
      id: file.name,
      title: file.name,
      date: 'N/A',
      sector: 'N/A',
      summary,
      source_file: '#'
    };
    summaries.unshift(doc);
    displaySummaries(summaries);
  }
});

// Extract text from PDF using PDF.js
async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += strings.join(' ') + '\n';
  }
  return fullText;
}

// Very simple AI-style summarizer
function summarizeText(text) {
  // Simple: take first 3 sentences
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];
  return sentences.slice(0, 3).join(' ');
}

// Initialize
document.addEventListener('DOMContentLoaded', loadDataset);
