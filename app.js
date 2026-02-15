// Demo toggle button
const toggleBtn = document.getElementById('toggle-btn');
const demoContent = document.getElementById('demo-content');
let showOriginal = false;

toggleBtn.addEventListener('click', () => {
  if (showOriginal) {
    demoContent.innerHTML = '<p><strong>AI Summary:</strong> Deputy Speaker moves Special Motions based on committee reports, approvals of appointments, and public participation updates in plain language.</p>';
    toggleBtn.textContent = 'Show Original Hansard';
  } else {
    demoContent.innerHTML = '<p><strong>Original Hansard:</strong> THAT, taking into consideration the findings of the Departmental Committee on Labour in its report on the approval hearing of a Nominee for Appointment as the Commission Secretary/Chief Executive Officer...</p>';
    toggleBtn.textContent = 'Show AI Summary';
  }
  showOriginal = !showOriginal;
});

// Load JSON summaries
async function loadSummaries() {
  try {
    const response = await fetch('summaries.json');
    const summaries = await response.json();

    const container = document.getElementById('summaries-container');
    container.innerHTML = '';

    summaries.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'summary-card';

      card.innerHTML = `
        <h3>${doc.title}</h3>
        <p><strong>Date:</strong> ${doc.date || 'N/A'}</p>
        <p><strong>Sector:</strong> ${doc.sector}</p>
        <p>${doc.summary}</p>
        <a href="${doc.source_file}" target="_blank">View Source</a>
      `;

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading summaries:', err);
  }
}
document.addEventListener('DOMContentLoaded', loadSummaries);

// Search functionality
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', () => {
  const filter = searchInput.value.toLowerCase();
  const cards = document.querySelectorAll('#summaries-container .summary-card');
  cards.forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(filter) ? '' : 'none';
  });
});

// PDF Summarization
async function summarizePDF(file) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://mozilla.github.io/pdf.js/build/pdf.worker.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n\n';
  }

  return simpleSummarizer(fullText);
}

// Simple summarizer: first 3 sentences
function simpleSummarizer(text) {
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];
  return sentences.slice(0, 3).join(' ');
}

// Handle PDF upload
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
