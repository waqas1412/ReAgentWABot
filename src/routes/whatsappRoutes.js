const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// API Routes for sending messages
router.post('/send', whatsappController.sendMessage);
router.post('/send-template', whatsappController.sendTemplateMessage);
router.get('/status/:messageSid', whatsappController.getMessageStatus);
router.get('/health', whatsappController.healthCheck);

module.exports = router; 