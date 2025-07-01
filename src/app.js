const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');

// Import routes
const whatsappRoutes = require('./routes/whatsappRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import config
const { config } = require('./config/environment');
const { testConnection } = require('./config/database');
const databaseService = require('./services/databaseService');

class App {
  constructor() {
    this.app = express();
    this.initializeDatabase();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  async initializeDatabase() {
    try {
      const isConnected = await testConnection();
      if (isConnected) {
        // Initialize reference data
        await databaseService.initializeReferenceData();
      }
    } catch (error) {
      console.error('Database initialization failed:', error.message);
      // Don't exit the process, just log the error
      // The app can still function for some operations without the database
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS middleware
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true
    }));

    // Logging middleware
    if (config.nodeEnv !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Body parsing middleware
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // Health check route
    this.app.get('/health', async (req, res) => {
      let dbStatus = 'disconnected';
      try {
        const isConnected = await testConnection();
        dbStatus = isConnected ? 'connected' : 'disconnected';
      } catch (error) {
        dbStatus = 'error';
      }

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        database: dbStatus
      });
    });

    // API documentation route
    this.app.get('/', (req, res) => {
      res.json({
        name: 'ReAgentBot WhatsApp API',
        version: '1.0.0',
        description: 'Express.js application with Twilio WhatsApp integration',
        endpoints: {
          health: 'GET /health',
          whatsapp: {
            send: 'POST /api/whatsapp/send',
            sendTemplate: 'POST /api/whatsapp/send-template',
            status: 'GET /api/whatsapp/status/:messageSid',
            health: 'GET /api/whatsapp/health'
          },
          webhooks: {
            whatsapp: 'POST /webhook/whatsapp',
            status: 'POST /webhook/whatsapp/status'
          }
        },
        documentation: {
          send: {
            method: 'POST',
            url: '/api/whatsapp/send',
            body: {
              to: '+1234567890',
              message: 'Hello World!',
              mediaUrl: 'https://example.com/image.jpg (optional)'
            }
          },
          template: {
            method: 'POST',
            url: '/api/whatsapp/send-template',
            body: {
              to: '+1234567890',
              template: 'verification_code',
              parameters: ['MyApp', '123456']
            }
          }
        }
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/whatsapp', whatsappRoutes);
    
    // Webhook routes
    this.app.use('/webhook', webhookRoutes);
  }

  setupErrorHandling() {
    // 404 handler (must be after all routes)
    this.app.use(notFoundHandler);
    
    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  getApp() {
    return this.app;
  }
}

module.exports = new App().getApp(); 