const fileInput = document.getElementById('file-input');
const processBtn = document.getElementById('process-btn');
const uploadedFilesDiv = document.getElementById('uploaded-files');
const summariesContainer = document.getElementById('summaries-container');

let uploadedFiles = [];

// Read files
fileInput.addEventListener('change', (e) => {
  uploadedFiles = Array.from(e.target.files);
  uploadedFilesDiv.innerHTML = '';
  uploadedFiles.forEach(file => {
    const fileDiv = document.createElement('div');
    fileDiv.textContent = `✅ ${file.name}`;
    uploadedFilesDiv.appendChild(fileDiv);
  });
});

// Helper: extract text from PDF
async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n\n';
  }
  return text;
}

// Helper: read text file
async function readTextFile(file) {
  return await file.text();
}

// AI summarization function (using gpt4all.js)
async function summarizeText(text) {
  // Initialize GPT4All model (small version for browser)
  const gpt = new GPT4All();
  await gpt.init({ model: 'ggml-gpt4all-j-v1.3-groovy' });

  const prompt = `You are an AI legislative assistant.
Extract key metadata (title, date, sector) if possible.
Summarize the following parliamentary document in plain language for easy understanding:\n\n${text}`;

  const summary = await gpt.prompt(prompt, { max_tokens: 500 });
  return summary;
}

// Process uploaded files
processBtn.addEventListener('click', async () => {
  if (uploadedFiles.length === 0) {
    alert('Please select files first.');
    return;
  }

  summariesContainer.innerHTML = '<p>Processing files...</p>';

  for (const file of uploadedFiles) {
    let text = '';
    if (file.type === 'application/pdf') {
      text = await extractPdfText(file);
    } else if (file.type === 'text/plain') {
      text = await readTextFile(file);
    }

    const summary = await summarizeText(text);

    // Create card
    const card = document.createElement('div');
    card.classList.add('summary-card');
    card.innerHTML = `
      <h3>${file.name}</h3>
      <button class="toggle-full-btn">Show Full Text</button>
      <pre class="full-text" style="display:none;">${text}</pre>
      <p><strong>AI Summary:</strong> ${summary}</p>
    `;

    summariesContainer.appendChild(card);

    const toggleBtn = card.querySelector('.toggle-full-btn');
    const fullText = card.querySelector('.full-text');

    toggleBtn.addEventListener('click', () => {
      if (fullText.style.display === 'none') {
        fullText.style.display = 'block';
        toggleBtn.textContent = 'Hide Full Text';
      } else {
        fullText.style.display = 'none';
        toggleBtn.textContent = 'Show Full Text';
      }
    });
  }

  uploadedFilesDiv.innerHTML = '';
});
