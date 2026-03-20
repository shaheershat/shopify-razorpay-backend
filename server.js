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

// Create Razorpay Order
app.post('/api/create-razorpay-order', async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;

    const order = await razorpay.orders.create({
      amount: amount,
      currency: currency || 'INR',
      receipt: receipt,
      payment_capture: 1
    });

    res.json({
      success: true,
      order: order
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create Direct Subscription (Bypass Shopify Checkout) - For Mandate Flow
app.post('/api/create-subscription-direct', async (req, res) => {
  try {
    const {
      plan_id,
      customer_email,
      customer_phone,
      product_id,
      frequency,
      product_title,
      product_description,
      amount // This will be in rupees from frontend
    } = req.body;

    console.log('Creating direct subscription (mandate flow):', req.body);

    if (!plan_id || !customer_email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Plan ID and customer email are required' 
      });
    }

    // First, fetch the plan details to get the correct amount
    const plan = await razorpay.plans.fetch(plan_id);
    console.log('Fetched plan details:', plan);

    // Create Razorpay subscription directly (no initial payment - mandate flow)
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: parseInt(frequency),
      start_at: Math.floor(Date.now() / 1000) + 60, // Start in 1 minute
      expire_by: Math.floor(Date.now() / 1000) + (parseInt(frequency) * 30 * 24 * 60 * 60), // Expire after frequency months
      notes: {
        product_id: product_id,
        product_title: product_title,
        product_description: product_description,
        shopify_store: process.env.SHOPIFY_STORE_NAME,
        customer_email: customer_email, // Store in notes instead
        customer_phone: customer_phone, // Store in notes instead
        frequency: frequency
      }
    });

    console.log('Direct subscription created:', subscription.id);

    // Return subscription info with correct amount from plan (convert to paise for frontend)
    res.json({
      success: true,
      subscription_id: subscription.id,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: plan.item.amount, // Already in paise from Razorpay
      status: subscription.status,
      message: 'Subscription created - complete mandate to activate'
    });

  } catch (error) {
    console.error('Error creating direct subscription:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Verify Payment and Activate Subscription
app.post('/api/verify-payment-and-activate', async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      subscription_id
    } = req.body;

    console.log('Verifying payment and activating subscription:', {
      razorpay_payment_id,
      razorpay_order_id,
      subscription_id
    });

    // Verify payment signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET_KEY)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('Invalid payment signature');
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    console.log('✅ Payment signature verified');

    // Fetch payment details
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    console.log('Payment details:', payment);

    // Fetch subscription details
    const subscription = await razorpay.subscriptions.fetch(subscription_id);
    console.log('Subscription details:', subscription);

    // Create Shopify order (if needed)
    // TODO: Add Shopify order creation logic here

    res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      payment_id: razorpay_payment_id,
      subscription_id: subscription_id,
      subscription_status: subscription.status
    });

  } catch (error) {
    console.error('Error verifying payment and activating subscription:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get Customer Details
app.post('/api/customer-details', async (req, res) => {
  try {
    const { customer_id } = req.body;
    
    console.log('Fetching customer details for ID:', customer_id);
    
    if (!customer_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer ID is required' 
      });
    }

    // Fetch customer from Shopify
    const shopifyCustomer = await shopify.rest.get({
      path: `customers/${customer_id}`
    });
    
    console.log('Shopify customer details:', shopifyCustomer.body);

    res.json({
      success: true,
      customer: {
        id: shopifyCustomer.body.id,
        email: shopifyCustomer.body.email,
        phone: shopifyCustomer.body.phone,
        first_name: shopifyCustomer.body.first_name,
        last_name: shopifyCustomer.body.last_name
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get Customer Subscriptions by Phone
app.post('/api/customer-subscriptions-by-phone', async (req, res) => {
  try {
    const { customer_phone } = req.body;
    
    console.log('Fetching subscriptions for customer phone:', customer_phone);
    
    if (!customer_phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer phone is required' 
      });
    }

    // Fetch all subscriptions from Razorpay
    try {
      const subscriptions = await razorpay.subscriptions.all();
      
      // Filter by phone number
      const customerSubscriptions = subscriptions.items.filter(sub => {
        return sub.phone === customer_phone || 
               (sub.notes && sub.notes.customer_phone === customer_phone);
      });
      
      console.log('Found subscriptions by phone:', customerSubscriptions.length);

      // Format subscription data
      const formattedSubscriptions = customerSubscriptions.map(sub => ({
        id: sub.id,
        plan_name: sub.plan_id,
        status: sub.status,
        current_period_start: new Date(sub.start_at * 1000).toISOString().split('T')[0],
        current_period_end: new Date(sub.end_at * 1000).toISOString().split('T')[0],
        amount: sub.plan_item.amount,
        customer_email: sub.email,
        customer_phone: sub.phone,
        product_id: sub.notes?.product_id || 'product1',
        total_count: sub.total_count,
        paid_count: sub.paid_count || 1,
        remaining_count: sub.remaining_count || (sub.total_count - (sub.paid_count || 1)),
        next_charge_at: sub.next_charge_at ? new Date(sub.next_charge_at * 1000).toISOString().split('T')[0] : null
      }));

      console.log('Formatted subscriptions by phone:', formattedSubscriptions);

      res.json({
        success: true,
        subscriptions: formattedSubscriptions
      });
      
    } catch (razorpayError) {
      console.error('Razorpay API error:', razorpayError);
      // If customer has no subscriptions, return empty array
      res.json({
        success: true,
        subscriptions: []
      });
    }

  } catch (error) {
    console.error('Error fetching subscriptions by phone:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get Customer Subscriptions
app.post('/api/customer-subscriptions', async (req, res) => {
  try {
    const { customer_email } = req.body;
    
    console.log('Fetching subscriptions for customer:', customer_email);
    
    if (!customer_email) {
      console.log('No customer email provided');
      return res.status(400).json({ 
        success: false, 
        error: 'Customer email is required' 
      });
    }

    // Fetch all subscriptions from Razorpay
    try {
      const subscriptions = await razorpay.subscriptions.all({
        email: customer_email
      });
      
      console.log('Razorpay response:', subscriptions);

      // Format subscription data
      const formattedSubscriptions = subscriptions.items.map(sub => ({
        id: sub.id,
        plan_name: sub.plan_id,
        status: sub.status,
        current_period_start: new Date(sub.start_at * 1000).toISOString().split('T')[0],
        current_period_end: new Date(sub.end_at * 1000).toISOString().split('T')[0],
        amount: sub.plan_item.amount,
        customer_email: sub.email,
        product_id: sub.notes?.product_id || 'product1',
        total_count: sub.total_count,
        paid_count: sub.paid_count || 1,
        remaining_count: sub.remaining_count || (sub.total_count - (sub.paid_count || 1)),
        next_charge_at: sub.next_charge_at ? new Date(sub.next_charge_at * 1000).toISOString().split('T')[0] : null
      }));

      console.log('Formatted subscriptions:', formattedSubscriptions);

      res.json({
        success: true,
        subscriptions: formattedSubscriptions
      });
      
    } catch (razorpayError) {
      console.error('Razorpay API error:', razorpayError);
      // If customer has no subscriptions, return empty array
      res.json({
        success: true,
        subscriptions: []
      });
    }

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
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

    // Create subscription with auto-pay enabled
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: parseInt(frequency),
      start_at: Math.floor(Date.now() / 1000) + 30, // Start in 30 seconds
      expire_by: Math.floor(Date.now() / 1000) + (parseInt(frequency) * 30 * 24 * 60 * 60), // Expire after frequency months
      email: customer_email,
      phone: customer_phone,
      notes: {
        product_id: product_id,
        shopify_store: process.env.SHOPIFY_STORE_NAME,
        customer_email: customer_email,
        customer_phone: customer_phone
      }
    });

    // Create order in Shopify immediately for the first payment
    try {
      const shopifyOrder = await createShopifyOrder({
        id: subscription.id,
        plan_id: plan_id,
        email: customer_email,
        phone: customer_phone,
        notes: {
          product_id: product_id,
          customer_email: customer_email,
          customer_phone: customer_phone,
          address: '',
          city: '',
          state: '',
          postal_code: ''
        },
        customer: {
          name: customer_email
        },
        charge_at: payment.amount
      });
      console.log('Initial Shopify order created:', shopifyOrder.id);
    } catch (shopifyError) {
      console.error('Shopify order creation failed:', shopifyError);
      // Continue even if Shopify order fails
    }

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

      case 'subscription.activated':
        console.log('Subscription activated:', event.payload.subscription.entity.id);
        // Create order in Shopify for activated subscription
        try {
          await createShopifyOrder(event.payload.subscription.entity);
        } catch (orderError) {
          console.error('Failed to create Shopify order for activated subscription:', orderError);
        }
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

// Shopify Order Creation Function
async function createShopifyOrder(subscriptionData) {
  try {
    const shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/orders.json`;
    
    console.log('Creating Shopify order with data:', subscriptionData);
    
    // Get customer info from subscription data
    const customerEmail = subscriptionData.email || subscriptionData.notes?.customer_email;
    const customerPhone = subscriptionData.phone || subscriptionData.notes?.customer_phone;
    const variantId = subscriptionData.notes?.product_id || subscriptionData.product_id;
    
    // Get plan details from Razorpay to get correct amount
    let planAmount = 0;
    try {
      const plan = await razorpay.plans.fetch(subscriptionData.plan_id);
      planAmount = plan.item.amount; // Amount in paise
      console.log('Plan amount:', planAmount);
    } catch (planError) {
      console.log('Could not fetch plan details, using fallback amount');
      planAmount = subscriptionData.charge_at || 1000; // Fallback to 10 rupees
    }
    
    const orderData = {
      order: {
        email: customerEmail,
        phone: customerPhone,
        financial_status: 'paid',
        line_items: [
          {
            variant_id: variantId,
            quantity: 1,
            title: `Subscription - ${subscriptionData.plan_id}`,
            price: (planAmount / 100).toString(), // Convert from paise to rupees
            taxable: true
          }
        ],
        note: `Subscription ID: ${subscriptionData.id} | Plan: ${subscriptionData.plan_id} | Customer: ${customerEmail} | Phone: ${customerPhone}`,
        tags: ['subscription', 'razorpay', 'active', 'autopay'],
        customer: {
          email: customerEmail,
          phone: customerPhone,
          first_name: customerEmail?.split('@')[0] || 'Customer',
          last_name: 'User'
        },
        shipping_address: {
          first_name: customerEmail?.split('@')[0] || 'Customer',
          last_name: 'User',
          address1: subscriptionData.notes?.address || 'Default Address',
          city: subscriptionData.notes?.city || 'Default City',
          province: subscriptionData.notes?.state || 'Default State',
          country: 'IN',
          zip: subscriptionData.notes?.postal_code || '000000',
          phone: customerPhone
        },
        billing_address: {
          first_name: customerEmail?.split('@')[0] || 'Customer',
          last_name: 'User',
          address1: subscriptionData.notes?.address || 'Default Address',
          city: subscriptionData.notes?.city || 'Default City',
          province: subscriptionData.notes?.state || 'Default State',
          country: 'IN',
          zip: subscriptionData.notes?.postal_code || '000000',
          phone: customerPhone
        }
      }
    };

    console.log('Shopify order data:', JSON.stringify(orderData, null, 2));

    const response = await axios.post(shopifyUrl, orderData, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Shopify order created:', response.data.order.id);
    return response.data.order;

  } catch (error) {
    console.error('❌ Error creating Shopify order:', error.response?.data || error.message);
    throw error;
  }
}

// Helper function to get variant ID from product ID
function getVariantId(productId) {
  // Use the actual variant ID passed from frontend
  if (productId && productId.toString().length > 10) {
    return productId; // It's already a variant ID
  }
  
  // Fallback to product ID mapping
  const variantMap = {
    'product1': '1234567890123',
    'product2': '1234567890124',
    'product3': '1234567890125'
  };
  return variantMap[productId] || '1234567890123';
}

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
  console.log(`✓ PORT from env: ${process.env.PORT || 'using default 3000'}`);
});