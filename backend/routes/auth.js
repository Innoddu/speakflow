const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

// Basic auth routes (placeholder for future authentication)
router.get('/test', (req, res) => {
  res.json({ message: 'Auth route working' });
});

module.exports = router; 