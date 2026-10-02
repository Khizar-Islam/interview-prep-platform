// This file contains the actual logic for each session-related API request.
// "Session" here means one full mock-interview attempt (one role + set of questions).
//
// Ownership checks: every route that reads/mutates a specific session now
// requires a userId and confirms it matches the session's actual owner
// before proceeding. This stops one user from viewing, completing, or
// deleting another user's session if they ever guessed or saw its id
// (e.g. via a shared link or browser history). Note: this trusts whatever
// userId the frontend sends — it's not a substitute for real server-side
// auth, but it closes the specific "wrong session id" gap.

const prisma = require('../config/db');
const aiService = require('../services/ai.service');

// GET /api/sessions/user/:userId
// Returns all past interview sessions for a given user (for the dashboard/history page)
async function getUserSessions(req, res, next) {
  try {
    const { userId } = req.params;

    const sessions = await prisma.interviewSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

// GET /api/sessions/:id?userId=...
// Returns one session including all its questions (used on the interview page)
async function getSessionById(req, res, next) {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: true, message: 'userId is required.' });
    }

    const session = await prisma.interviewSession.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { questionOrder: 'asc' },
          include: { answer: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: true, message: 'Session not found.' });
    }

    if (session.userId !== userId) {
      return res.status(403).json({ error: true, message: 'You do not have access to this session.' });
    }

    res.json({ session });
  } catch (err) {
    next(err);
  }
}

// POST /api/sessions
// Creates a new session AND asks the AI to generate 5 real interview questions
// for it, then saves both the session and its questions to the database.
// If the AI call fails (e.g. Gemini is temporarily overloaded), we delete the
// half-created session instead of leaving a broken "0 questions" record behind.
async function createSession(req, res, next) {
  let session = null;

  try {
    const { userId, role, experienceLevel } = req.body;

    if (!userId || !role || !experienceLevel) {
      return res.status(400).json({
        error: true,
        message: 'userId, role, and experienceLevel are all required.',
      });
    }

    // Step 1: create the session row first
    session = await prisma.interviewSession.create({
      data: { userId, role, experienceLevel },
    });

    // Step 2: ask the AI to generate questions for this role/level
    const generatedQuestions = await aiService.generateQuestions(role, experienceLevel);

    // Step 3: save each generated question, linked to this session
    const savedQuestions = await Promise.all(
      generatedQuestions.map((q, index) =>
        prisma.question.create({
          data: {
            sessionId: session.id,
            questionText: q.questionText,
            category: q.category,
            questionOrder: index + 1,
          },
        })
      )
    );

    res.status(201).json({ session, questions: savedQuestions });
  } catch (err) {
    // Clean-up: if the session row was created but question generation failed,
    // delete the orphaned session so it doesn't show up as a broken "0 questions"
    // entry in the dashboard later.
    if (session) {
      await prisma.interviewSession.delete({ where: { id: session.id } }).catch(() => {
        // If this cleanup delete also fails, we still want the original error
        // below to reach the user, so we swallow this one silently.
      });
    }
    next(err);
  }
}

// PATCH /api/sessions/:id/complete
// Marks a session as finished and stores the final overall score
async function completeSession(req, res, next) {
  try {
    const { id } = req.params;
    const { overallScore, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: true, message: 'userId is required.' });
    }

    const existing = await prisma.interviewSession.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ error: true, message: 'Session not found.' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: true, message: 'You do not have access to this session.' });
    }

    const session = await prisma.interviewSession.update({
      where: { id },
      data: {
        status: 'completed',
        overallScore,
        completedAt: new Date(),
      },
    });

    res.json({ session });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/sessions/:id?userId=...
async function deleteSession(req, res, next) {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: true, message: 'userId is required.' });
    }

    const existing = await prisma.interviewSession.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ error: true, message: 'Session not found.' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: true, message: 'You do not have access to this session.' });
    }

    await prisma.interviewSession.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUserSessions,
  getSessionById,
  createSession,
  completeSession,
  deleteSession,
};