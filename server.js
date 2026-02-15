require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(__dirname));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/process", async (req, res) => {
  try {
    const { text, filename } = req.body;
    if (!text) return res.json({ error: "No text received." });

    const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
    const date = extractDate(text);
    const sector = detectSector(text);
    const summary = await summarize(text);

    res.json({
      title,
      date,
      sector,
      summary,
      extractedText: text.slice(0, 5000)
    });

  } catch (err) {
    console.error(err);
    res.json({ error: "Processing failed." });
  }
});

function extractDate(text) {
  const match = text.match(/\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
  return match ? match[0] : "Not detected";
}

function detectSector(text) {
  const lower = text.toLowerCase();
  if (lower.includes("defence") || lower.includes("security")) return "Security";
  if (lower.includes("finance") || lower.includes("treasury")) return "Finance";
  if (lower.includes("education")) return "Education";
  if (lower.includes("environment") || lower.includes("nema")) return "Environment";
  if (lower.includes("health")) return "Health";
  return "Governance";
}

async function summarize(text) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert civic intelligence analyst. Summarize parliamentary documents clearly in structured bullet points."
      },
      {
        role: "user",
        content: text.slice(0, 12000)
      }
    ],
    temperature: 0.3
  });

  return response.choices[0].message.content;
}

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

