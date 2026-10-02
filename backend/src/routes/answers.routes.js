// Defines the URL for submitting an answer.

const express = require('express');
const router = express.Router();
const answersController = require('../controllers/answers.controller');
const { submitAnswerLimiter } = require('../middleware/rateLimiter');

router.post('/', submitAnswerLimiter, answersController.submitAnswer);

module.exports = router;