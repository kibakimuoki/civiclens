// --- Demo Toggle ---
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

// --- Summaries ---
const summaries = [];

// Simple AI-like summarizer (first 2 sentences)
function summarizeText(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ');
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
      <a href="${doc.source_file}" target="_blank">View Source</a>
    `;
    container.appendChild(card);
  });
}

// Process uploaded files
async function processFiles(files) {
  for (const file of files) {
    const text = await file.text();
    summaries.push({
      title: file.name.replace(/\.[^/.]+$/, ""),
      date: "N/A",
      sector: "N/A",
      summary: summarizeText(text),
      source_file: URL.createObjectURL(file)
    });
  }
  displaySummaries(summaries);
}

// Filter search
function filterSummaries(query) {
  const filtered = summaries.filter(doc =>
    doc.title.toLowerCase().includes(query.toLowerCase()) ||
    doc.summary.toLowerCase().includes(query.toLowerCase())
  );
  displaySummaries(filtered);
}

// Event listeners
document.getElementById('processBtn').addEventListener('click', () => {
  const files = document.getElementById('fileUpload').files;
  if (files.length) processFiles(files);
});

document.getElementById('searchBox').addEventListener('input', (e) => {
  filterSummaries(e.target.value);
});
