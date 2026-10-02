// This is the file that actually starts your backend server.
// Running "npm run dev" in the backend folder executes this file.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const sessionsRoutes = require('./routes/sessions.routes');
const answersRoutes = require('./routes/answers.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Allows your Next.js frontend (running on a different port) to talk to this backend
app.use(cors());

// Allows the server to understand JSON sent from the frontend (req.body)
app.use(express.json());

// Simple health check — visit http://localhost:5000/health in your browser
// to confirm the server is actually running
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running.' });
});

// All session-related routes live under /api/sessions
// e.g. POST http://localhost:5000/api/sessions creates a new session
app.use('/api/sessions', sessionsRoutes);

// All answer-submission routes live under /api/answers
// e.g. POST http://localhost:5000/api/answers submits an answer and streams AI feedback
app.use('/api/answers', answersRoutes);

// This MUST be the last app.use() call — it catches any error from any route above
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
