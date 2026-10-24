// This file handles what happens when a user submits an answer to a question:
// 1. Confirm the question belongs to the signed-in user (via its parent session)
// 2. Save their answer text to the database
// 3. Ask the AI for feedback, streaming it live to the frontend
// 4. Once streaming finishes, save the feedback + scores to the database too

const prisma = require('../config/db');
const aiService = require('../services/ai.service');

// POST /api/answers
// Body: { questionId, answerText }. The user comes from req.userId (verified token).
async function submitAnswer(req, res, next) {
  try {
    const { questionId, answerText } = req.body;

    if (typeof questionId !== 'string' || !questionId || !answerText) {
      return res.status(400).json({
        error: true,
        message: 'questionId and answerText are both required.',
      });
    }

    // Only finds the question if its parent session belongs to the signed-in
    // user. Someone else's question looks exactly like a missing one (404).
    const question = await prisma.question.findFirst({
      where: { id: questionId, session: { userId: req.userId } },
    });

    if (!question) {
      return res.status(404).json({ error: true, message: 'Question not found.' });
    }

    // Save the answer text immediately (feedback fields stay empty for now)
    const answer = await prisma.answer.upsert({
      where: { questionId },
      update: { answerText },
      create: { questionId, answerText },
    });

    // Stream the AI feedback directly to the response.
    // streamFeedback() writes chunks to `res` itself and resolves with the full text
    // once the stream is done, which we then save to the database below.
    const fullFeedbackText = await aiService.streamFeedback(
      question.questionText,
      answerText,
      res
    );

    const scores = aiService.extractScores(fullFeedbackText);

    await prisma.answer.update({
      where: { questionId },
      data: {
        aiFeedback: fullFeedbackText,
        clarityScore: scores.clarityScore,
        structureScore: scores.structureScore,
        contentScore: scores.contentScore,
      },
    });

    // Note: res.end() was already called inside streamFeedback(), so we don't
    // send another response here — that would cause a "headers already sent" error.
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitAnswer,
};