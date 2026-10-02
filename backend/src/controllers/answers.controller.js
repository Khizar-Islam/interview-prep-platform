// This file handles what happens when a user submits an answer to a question:
// 1. Confirm the question belongs to the requesting user (via its parent session)
// 2. Save their answer text to the database
// 3. Ask the AI for feedback, streaming it live to the frontend
// 4. Once streaming finishes, save the feedback + scores to the database too

const prisma = require('../config/db');
const aiService = require('../services/ai.service');

// POST /api/answers
// Body: { questionId, answerText, userId }
async function submitAnswer(req, res, next) {
  try {
    const { questionId, answerText, userId } = req.body;

    if (!questionId || !answerText || !userId) {
      return res.status(400).json({
        error: true,
        message: 'questionId, answerText, and userId are all required.',
      });
    }

    // Look up the question AND its parent session, so we have the question's
    // text for the AI, and the session's real owner for the ownership check.
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { session: true },
    });

    if (!question) {
      return res.status(404).json({ error: true, message: 'Question not found.' });
    }

    if (question.session.userId !== userId) {
      return res.status(403).json({
        error: true,
        message: 'You do not have access to this question.',
      });
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