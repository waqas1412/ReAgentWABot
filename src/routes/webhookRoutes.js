const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// Webhook Routes for receiving messages from Twilio
router.post('/whatsapp', whatsappController.receiveMessage);
router.post('/whatsapp/status', whatsappController.messageStatus);

module.exports = router; 