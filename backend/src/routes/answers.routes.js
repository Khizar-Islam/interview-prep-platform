// Defines the URL for submitting an answer.

const express = require('express');
const router = express.Router();
const answersController = require('../controllers/answers.controller');

router.post('/', answersController.submitAnswer);

module.exports = router;
