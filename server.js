const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');

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

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY
});

// ============= ROUTES =============

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running!' });
});

// Create Subscription
app.post('/api/create-subscription', async (req, res) => {
  try {
    const {
      payment_id,
      plan_id,
      customer_email,
      customer_phone,
      product_id,
      frequency
    } = req.body;

    // Verify payment with Razorpay
    const payment = await razorpay.payments.fetch(payment_id);
    
    if (payment.status !== 'captured') {
      return res.json({ 
        success: false, 
        error: 'Payment not verified' 
      });
    }

    // Create subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: parseInt(frequency),
      email: customer_email,
      phone: customer_phone,
      notes: {
        product_id: product_id,
        shopify_store: process.env.SHOPIFY_STORE_NAME
      }
    });

    // Create order in Shopify (optional - you can implement this)
    // const shopifyOrder = await createShopifyOrder(...);

    res.json({
      success: true,
      subscription_id: subscription.id,
      status: subscription.status,
      message: 'Subscription created successfully'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Pause Subscription
app.post('/api/subscriptions/pause', async (req, res) => {
  try {
    const { subscription_id } = req.body;

    const subscription = await razorpay.subscriptions.pause(
      subscription_id,
      { delay_at: 'now' }
    );

    res.json({
      success: true,
      status: subscription.status,
      message: 'Subscription paused'
    });

  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Resume Subscription
app.post('/api/subscriptions/resume', async (req, res) => {
  try {
    const { subscription_id } = req.body;

    const subscription = await razorpay.subscriptions.resume(
      subscription_id,
      { delay_at: 'now' }
    );

    res.json({
      success: true,
      status: subscription.status,
      message: 'Subscription resumed'
    });

  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Skip Payment
app.post('/api/subscriptions/skip', async (req, res) => {
  try {
    const { subscription_id } = req.body;

    const subscription = await razorpay.subscriptions.skip(
      subscription_id,
      { delay_at: 'now' }
    );

    res.json({
      success: true,
      status: subscription.status,
      message: 'Payment skipped'
    });

  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Cancel Subscription
app.post('/api/subscriptions/cancel', async (req, res) => {
  try {
    const { subscription_id } = req.body;

    const subscription = await razorpay.subscriptions.cancel(
      subscription_id,
      { delay_at: 'now' }
    );

    res.json({
      success: true,
      status: subscription.status,
      message: 'Subscription cancelled'
    });

  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Razorpay Webhook Handler
app.post('/webhooks/razorpay', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body.toString();

    // Verify webhook signature
    const hash = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (hash !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body);

    console.log('Webhook Event:', event.event);

    // Handle different events
    switch(event.event) {
      case 'subscription.paused':
        console.log('Subscription paused:', event.payload.subscription.entity.id);
        // Update your database
        break;

      case 'subscription.resumed':
        console.log('Subscription resumed:', event.payload.subscription.entity.id);
        // Update your database
        break;

      case 'subscription.cancelled':
        console.log('Subscription cancelled:', event.payload.subscription.entity.id);
        // Update your database
        break;

      case 'subscription.halted':
        console.log('Subscription halted:', event.payload.subscription.entity.id);
        // Update your database
        break;

      case 'payment.authorized':
        console.log('Payment authorized:', event.payload.payment.entity.id);
        // Create order in Shopify
        break;

      case 'payment.failed':
        console.log('Payment failed:', event.payload.payment.entity.id);
        // Handle failed payment
        break;

      default:
        console.log('Unknown event:', event.event);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
});
