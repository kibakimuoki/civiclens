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
        <p><strong>Date:</strong> ${doc.date || 'N/A'} | <strong>Sector:</strong> ${doc.sector}</p>
        <p>${doc.summary.substring(0, 300)}... <a href="${doc.source_file}" target="_blank">Read full</a></p>
        <p><strong>Keywords:</strong> ${doc.keywords.join(', ')}</p>
      `;

      container.appendChild(card);
    });

  } catch (err) {
    console.error('Error loading summaries:', err);
    document.getElementById('summaries').innerHTML = '<p>Failed to load summaries. Please try again later.</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadSummaries);
