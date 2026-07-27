require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Import database connection
const { connectDB } = require('./src/config/database');

// Import middleware
const { setupGlobalMiddleware } = require('./src/middleware/global');

// Import routes
const authRoutes = require('./src/routes/auth');
const webhookRoutes = require('./src/routes/webhook');
const vendorRoutes = require('./src/routes/vendor');

// Import controllers
const AdminController = require('./src/controllers/AdminController');
const { requireAdmin } = require('./src/middleware/auth');

const app = express();

// Initialize billing engine
const BillingEngine = require('./src/services/billing/BillingEngine');
const billingEngine = new BillingEngine();

// Initialize SLA processor
const { slaProcessor } = require('./src/services/SLAService');

// Initialize feedback processing
const { FeedbackService } = require('./src/models/FeedbackModel');

// Initialize feedback processing - run every 2 minutes for faster feedback delivery
setInterval(async () => {
    try {
        await FeedbackService.processPendingFeedbacks();
    } catch (error) {
        console.error('[FEEDBACK] Error processing pending feedbacks:', error);
    }
}, 2 * 60 * 1000); // Every 2 minutes

// Process abandoned conversations every hour
setInterval(async () => {
    try {
        await FeedbackService.processAbandonedConversations();
    } catch (error) {
        console.error('[FEEDBACK] Error processing abandoned conversations:', error);
    }
}, 60 * 60 * 1000); // Every hour

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// View engine and static files
app.set('view engine', 'ejs');
app.use('/uploads', express.static('uploads'));
app.use('/css', express.static('public/css'));
app.use('/js', express.static('public/js'));

// Setup global middleware (vendor/admin context)
setupGlobalMiddleware(app);

// Connect to MongoDB
connectDB();

// Create required directories
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'css'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });
}

// Routes
app.use('/', authRoutes);
app.use('/webhook', webhookRoutes);
app.use('/', vendorRoutes);

// Admin routes (keeping existing structure for now)
app.get('/admin', requireAdmin, AdminController.dashboard);
app.get('/admin/vendors', requireAdmin, AdminController.vendorList);
app.get('/admin/vendors/create', requireAdmin, AdminController.vendorCreate);
app.post('/admin/vendors/create', requireAdmin, AdminController.vendorStore);
app.get('/admin/vendors/:vendorId/edit', requireAdmin, AdminController.vendorEdit);
app.post('/admin/vendors/:vendorId/edit', requireAdmin, AdminController.vendorUpdate);
app.get('/admin/vendors/:vendorId', requireAdmin, AdminController.vendorDetail);
app.post('/admin/vendors/:vendorId/toggle', requireAdmin, AdminController.vendorToggle);
app.get('/admin/wallet', requireAdmin, AdminController.walletManagement);
app.post('/admin/wallet/topup', requireAdmin, AdminController.walletTopup);
app.get('/admin/topup-history', requireAdmin, AdminController.topupHistory);
app.get('/admin/billing-history', requireAdmin, AdminController.billingHistory);
app.get('/admin/pricing-config', requireAdmin, AdminController.pricingConfig);
app.post('/admin/pricing/exchange-rate', requireAdmin, AdminController.updateExchangeRate);
app.post('/admin/pricing/global', requireAdmin, AdminController.updateGlobalPricing);
app.post('/admin/pricing/default-markup', requireAdmin, AdminController.updateDefaultMarkup);

// Import remaining routes from old app.js (temporary)
require('./src/routes/legacy')(app);

// Health check endpoint
app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mongodb: 'disconnected',
        sla_processor: slaProcessor.isRunning ? 'running' : 'stopped',
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        }
    };
    
    try {
        await mongoose.connection.db.admin().ping();
        health.mongodb = 'connected';
    } catch (e) {
        health.mongodb = 'error';
        health.status = 'degraded';
    }
    
    res.status(health.status === 'ok' ? 200 : 503).json(health);
});

const port = process.env.WHATSAPP_BUSINESS_PORT || 3001;
app.listen(port, () => {
    console.log(`WhatsApp Business Bot running on port ${port}`);
    console.log('Webhook URL: /webhook');
    console.log(`Uploads directory: ${uploadsDir}`);
    console.log(`Web interface: http://localhost:${port}`);
    console.log('✅ Refactored architecture loaded successfully');
    
    // Start SLA processor after server starts
    setTimeout(() => {
        slaProcessor.start();
        console.log('🎯 SLA Management System: ACTIVE');
    }, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    slaProcessor.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    slaProcessor.stop();
    process.exit(0);
});