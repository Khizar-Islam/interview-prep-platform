// This file is the ONLY place in the backend that talks to the Gemini API.
// Keeping all AI logic in one file means if you ever want to change the prompt,
// switch models, or add logging, you only touch this file.

const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-2.5-flash is on Google's free tier and is fast/cheap enough
// for both question generation and feedback.
const MODEL = 'gemini-3.5-flash';

/**
 * Generates 5 interview questions for a given role and experience level.
 * Returns an array like:
 * [{ questionText: "...", category: "behavioral" }, ...]
 */
async function generateQuestions(role, experienceLevel) {
  const prompt = `You are a senior technical interviewer. Generate exactly 5 interview questions for a ${experienceLevel} ${role} candidate. Mix 2 behavioral, 2 technical, and 1 system-design question (if the role doesn't fit system design, replace it with a third technical question). Respond with ONLY a valid JSON array, no other text, no markdown formatting, no code fences. Format: [{"questionText": "...", "category": "behavioral"}, {"questionText": "...", "category": "technical"}]`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const rawText = response.text;

  // Defensive parsing: strip any accidental markdown code fences before parsing JSON.
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('AI returned invalid JSON for questions: ' + rawText);
  }

  return questions;
}

/**
 * Streams AI feedback for a single answer directly to the HTTP response object.
 * This makes the feedback appear "typed out" live on the frontend instead of
 * waiting for the whole response to finish generating.
 *
 * res = the Express response object, passed in from the controller.
 */
async function streamFeedback(questionText, answerText, res) {
  const prompt = `You are an experienced interview coach. The candidate was asked: "${questionText}". Their answer was: "${answerText}". Give constructive feedback covering clarity, structure (mention the STAR method if this is a behavioral question), and correctness/depth if technical. Keep it to 3-4 short sentences. Then on new lines, output exactly these three lines with numeric scores out of 10: SCORE_CLARITY:<number> SCORE_STRUCTURE:<number> SCORE_CONTENT:<number>`;

  // Set headers so the browser knows to expect a stream of text chunks
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullText = '';

  try {
    const streamResult = await ai.models.generateContentStream({
      model: MODEL,
      contents: prompt,
    });

    // Gemini's stream yields chunks one at a time; each chunk has .text
    for await (const chunk of streamResult) {
      const textChunk = chunk.text || '';
      fullText += textChunk;
      res.write(`data: ${JSON.stringify({ chunk: textChunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }

  return fullText;
}

/**
 * Pulls the SCORE_CLARITY / SCORE_STRUCTURE / SCORE_CONTENT numbers out of
 * the raw AI feedback text so they can be saved as separate columns in the DB.
 */
function extractScores(feedbackText) {
  const clarityMatch = feedbackText.match(/SCORE_CLARITY:\s*(\d+(\.\d+)?)/i);
  const structureMatch = feedbackText.match(/SCORE_STRUCTURE:\s*(\d+(\.\d+)?)/i);
  const contentMatch = feedbackText.match(/SCORE_CONTENT:\s*(\d+(\.\d+)?)/i);

  return {
    clarityScore: clarityMatch ? parseFloat(clarityMatch[1]) : null,
    structureScore: structureMatch ? parseFloat(structureMatch[1]) : null,
    contentScore: contentMatch ? parseFloat(contentMatch[1]) : null,
  };
}

module.exports = {
  generateQuestions,
  streamFeedback,
  extractScores,
};