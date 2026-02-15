// PDF.js setup
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

// Load summaries from JSON
async function loadSummaries() {
  try {
    const response = await fetch('summaries.json');
    const summaries = await response.json();
    displaySummaries(summaries, document.getElementById('summaries-container'));
  } catch (err) {
    console.error('Error loading summaries:', err);
  }
}

// Display summaries in a container
function displaySummaries(summaries, container) {
  container.innerHTML = '';
  summaries.forEach(doc => {
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
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  fetch('summaries.json')
    .then(res => res.json())
    .then(summaries => {
      const filtered = summaries.filter(s => 
        s.title.toLowerCase().includes(query) ||
        (s.sector && s.sector.toLowerCase().includes(query)) ||
        (s.keywords && s.keywords.join(' ').toLowerCase().includes(query))
      );
      displaySummaries(filtered, document.getElementById('summaries-container'));
    });
});

// Demo toggle button
const toggleBtn = document.getElementById('toggle-btn');
const demoContent = document.getElementById('demo-content');
let showOriginal = false;

toggleBtn.addEventListener('click', () => {
  if (showOriginal) {
    demoContent.innerHTML = '<p><strong>AI Summary:</strong> Deputy Speaker moves Special Motions based on committee reports, approvals of appointments, and public participation updates in plain language.</p>';
    toggleBtn.textContent = 'Show Original Hansard';
  } else {
    demoContent.innerHTML = '<p><strong>Original Hansard:</strong> THAT, taking into consideration the findings of the Departmental Committee on Labour in its report on the approval hearing of a Nominee for Appointment...</p>';
    toggleBtn.textContent = 'Show AI Summary';
  }
  showOriginal = !showOriginal;
});

// Handle PDF upload
let uploadedFiles = [];
document.getElementById('pdf-upload').addEventListener('change', (e) => {
  uploadedFiles = Array.from(e.target.files);
});

// Process uploaded PDFs
document.getElementById('process-pdf-btn').addEventListener('click', async () => {
  const container = document.getElementById('uploaded-summaries');
  container.innerHTML = '';
  for (let file of uploadedFiles) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    // Simple in-browser summary (first 300 chars)
    const summaryText = fullText.length > 300 ? fullText.slice(0, 300) + '...' : fullText;

    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <h3>${file.name}</h3>
      <p><strong>Date:</strong> N/A</p>
      <p><strong>Sector:</strong> N/A</p>
      <p>${summaryText}</p>
    `;
    container.appendChild(card);
  }
});

// Initial load
document.addEventListener('DOMContentLoaded', loadSummaries);
