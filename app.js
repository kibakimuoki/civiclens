// app.js
async function loadSummaries() {
  try {
    const response = await fetch('summaries.json');
    const summaries = await response.json();

    const container = document.getElementById('summaries');
    container.innerHTML = '';

    summaries.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'summary-card';

      card.innerHTML = `
        <h2>${doc.title}</h2>
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
