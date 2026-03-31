const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');

dotenv.config();

// Debug logging
console.log('Environment variables loaded:');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'SET' : 'NOT SET');
console.log('RAZORPAY_SECRET_KEY:', process.env.RAZORPAY_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('RAZORPAY_WEBHOOK_SECRET:', process.env.RAZORPAY_WEBHOOK_SECRET ? 'SET' : 'NOT SET');
console.log('SHOPIFY_STORE_NAME:', process.env.SHOPIFY_STORE_NAME ? 'SET' : 'NOT SET');
console.log('SHOPIFY_ACCESS_TOKEN:', process.env.SHOPIFY_ACCESS_TOKEN ? 'SET' : 'NOT SET');

// Check required environment variables
const requiredEnvVars = ['RAZORPAY_KEY_ID', 'RAZORPAY_SECRET_KEY', 'RAZORPAY_WEBHOOK_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these environment variables and restart the server.');
  process.exit(1);
}

// Start server
async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Enable CORS for all routes
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Initialize Razorpay instance
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    secret: process.env.RAZORPAY_SECRET_KEY
  });

  // ============= ROUTES =============

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'Backend is running!' });
  });

  // Test Order Creation Endpoint
  app.post('/api/test-order', async (req, res) => {
    try {
      console.log('🧪 Creating test order...');
      
      const testOrderData = {
        id: 'test_sub_' + Date.now(),
        plan_id: 'plan_SSfug4F5nvQEi5', // Your existing plan
        email: 'test@example.com',
        phone: '+919876543210',
        notes: {
          // Customer info
          name: 'Test Customer',
          email: 'test@example.com',
          phone: '+919876543210',
          addr: '123 Test Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          pin: '400001',
          
          // Product info
          product_id: '46513506189501',
          product_title: 'Test Subscription',
          product_description: 'Test subscription plan',
          frequency: '3months',
          
          // ENHANCED: Box and items selection from cart
          boxes: 'Two Boxes',
          items: '2 M pads, 6 L pads, 4 XL pads',
          selected_plan: '3 Months Plan'
        }
      };
      
      // Create Shopify order
      const shopifyOrder = await createShopifyOrder(testOrderData);
      
      res.json({
        success: true,
        message: 'Test order created successfully',
        shopify_order: shopifyOrder,
        test_data: testOrderData
      });
      
    } catch (error) {
      console.error('❌ Test order creation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ Health check: http://localhost:${PORT}/health`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ PORT from env: ${process.env.PORT || 'using default 3000'}`);
  });
}

startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
