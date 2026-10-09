# Interview Prep Platform

Practice for a job interview with an AI interviewer. Pick a role and experience level, answer five generated questions, and get live-streamed feedback with scores on each answer.

**Live demo:** https://interview-prep-platform-xy36.vercel.app

> The API runs on a free host, so the first request after a quiet period can take up to a minute. Sign-in is Google only.

<!-- Add 2-3 screenshots here (docs/ folder): the home page, a question with streaming feedback, the dashboard -->

## What it does

- **Tailored questions.** Gemini writes five questions for your role and level: two behavioral, two technical and one system design.
- **Live feedback.** Feedback for each answer streams in as it is written, with scores out of 10 for clarity, structure and content. Behavioral answers are checked against the STAR method.
- **Session history.** Every session is saved with its questions, answers, feedback and scores.

## Design decisions

- **Streaming over SSE.** Feedback is sent as server-sent events from Express, so the text appears as the model writes it.
- **Rate limits.** Creating sessions and submitting answers are limited per IP, since each call uses the Gemini quota.
- **No raw errors to the browser.** Failures are logged on the server and the user sees a friendly message.
- **Defensive JSON parsing.** Code fences are stripped from the model's output before parsing.
- **Cold start handling.** The first request retries once with a "waking up the database" message when the free database is asleep.
- **Auth model names.** The interview model is called `InterviewSession` (mapped to the `sessions` table) so it doesn't clash with NextAuth's `Session`.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion |
| Auth | NextAuth with Google OAuth and the Prisma adapter |
| Backend | Node.js, Express |
| Database | PostgreSQL (Neon), Prisma |
| AI | Google Gemini |
| Hosting | Vercel (web), Render (API) |

## Project layout

```
backend/    Express API: sessions, answers, Gemini service, rate limiters
frontend/   Next.js app: home, new interview, interview page, dashboard
```

## Run it locally

1. Create a Postgres database (Neon works) and a Google OAuth client.
2. In `backend/`, create `.env` with `DATABASE_URL`, `GEMINI_API_KEY` and `PORT`. Then run `npm install`, `npx prisma migrate dev` and `npm run dev`.
3. In `frontend/`, create `.env.local` with `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` and `NEXT_PUBLIC_API_URL`. Then run `npm install` and `npm run dev`.
4. Open http://localhost:3000.

## Known limits

- Free-tier Gemini quotas limit how many sessions can run per day.
- Answers are typed text only; there is no voice or video practice.
- Scores come from the model and are a guide, not an assessment.

## Author

Khizar Islam Rathore, Software Engineering student at the University of Karachi.
GitHub: github.com/Khizar-Islam | LinkedIn: linkedin.com/in/khizar-islam-rathore
