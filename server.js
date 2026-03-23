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

// Get Customer Subscriptions by Notes Matching
app.post('/api/customer-subscriptions-by-notes', async (req, res) => {
  try {
    const { customer_email, customer_phone } = req.body;
    
    console.log('🔍 Checking subscriptions by notes matching:', { customer_email, customer_phone });
    
    if (!customer_email && !customer_phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer email or phone is required' 
      });
    }

    // Normalize phone number for comparison
    const normalizePhone = (phone) => {
      if (!phone) return '';
      // Remove all non-digit characters
      return phone.replace(/\D/g, '');
    };

    const normalizedCustomerPhone = normalizePhone(customer_phone);
    console.log('Normalized customer phone:', normalizedCustomerPhone);

    // Fetch all subscriptions from Razorpay
    try {
      const subscriptions = await razorpay.subscriptions.all();
      
      // Filter subscriptions by checking notes AND customer fields for matching email or phone
      // Include ALL statuses (active, paused, cancelled, completed)
      const matchingSubscriptions = subscriptions.items.filter(sub => {
        // Check email match in multiple places
        const emailMatch = customer_email && (
          sub.notes?.customer_email === customer_email || 
          sub.notes?.email === customer_email ||
          sub.email === customer_email ||
          sub.customer_email === customer_email
        );
        
        // Check phone match in multiple places (normalize both for comparison)
        const notesPhone = normalizePhone(sub.notes?.customer_phone) || 
                          normalizePhone(sub.notes?.phone) || 
                          normalizePhone(sub.phone) || 
                          normalizePhone(sub.customer_phone);
        const phoneMatch = normalizedCustomerPhone && notesPhone && notesPhone === normalizedCustomerPhone;
        
        console.log(`Checking subscription ${sub.id}:`, {
          status: sub.status,
          hasNotes: !!sub.notes,
          hasPlanItem: !!sub.plan_item,
          emailMatch,
          phoneMatch,
          notesEmail: sub.notes?.customer_email,
          notesPhone: sub.notes?.customer_phone,
          normalizedNotesPhone: notesPhone,
          subEmail: sub.email,
          subPhone: sub.phone,
          subCustomerEmail: sub.customer_email
        });
        
        return emailMatch || phoneMatch;
      });
      
      console.log('Found all subscriptions by notes matching:', matchingSubscriptions.length);

      // Format subscription data with safety checks and enhanced details
      const formattedSubscriptions = [];
      
      for (const sub of matchingSubscriptions) {
        // Get amount from plan_item or fallback to 0
        let amount = 0;
        if (sub.plan_item && sub.plan_item.amount) {
          amount = sub.plan_item.amount;
        } else if (sub.plan_id) {
          // Try to fetch plan details if amount is missing
          try {
            const plan = await razorpay.plans.fetch(sub.plan_id);
            amount = plan.item.amount;
            console.log(`Fetched amount from plan ${sub.plan_id}:`, amount);
          } catch (planError) {
            console.log(`Could not fetch plan ${sub.plan_id}, using fallback amount`);
            amount = 0;
          }
        }
        
        formattedSubscriptions.push({
          id: sub.id,
          plan_name: sub.plan_id,
          status: sub.status,
          current_period_start: new Date(sub.start_at * 1000).toISOString().split('T')[0],
          current_period_end: new Date(sub.end_at * 1000).toISOString().split('T')[0],
          amount: amount, // Amount in paise
          customer_email: sub.email || sub.notes?.customer_email || 'N/A',
          customer_phone: sub.phone || sub.notes?.customer_phone || 'N/A',
          customer_id: sub.customer_id,
          product_id: sub.notes?.product_id || 'product1',
          product_title: sub.notes?.product_title || 'Subscription Plan',
          product_description: sub.notes?.product_description || '',
          notes_email: sub.notes?.customer_email || '',
          notes_phone: sub.notes?.customer_phone || '',
          total_count: sub.total_count,
          paid_count: sub.paid_count || 1,
          remaining_count: sub.remaining_count || (sub.total_count - (sub.paid_count || 1)),
          next_charge_at: sub.next_charge_at ? new Date(sub.next_charge_at * 1000).toISOString().split('T')[0] : null,
          created_at: new Date(sub.created_at * 1000).toISOString().split('T')[0],
          short_url: sub.short_url,
          auth_attempts: sub.auth_attempts || 0
        });
      }

      console.log('Formatted all subscriptions:', formattedSubscriptions);

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
    console.error('Error fetching subscriptions by notes:', error);
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

// Get Customer Subscriptions by Razorpay Customer ID
app.post('/api/customer-subscriptions-by-customer-id', async (req, res) => {
  try {
    const { customer_id } = req.body;
    
    console.log('Fetching subscriptions for Razorpay customer ID:', customer_id);
    
    if (!customer_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer ID is required' 
      });
    }

    // Fetch all subscriptions from Razorpay
    try {
      const subscriptions = await razorpay.subscriptions.all();
      
      // Filter by customer ID
      const customerSubscriptions = subscriptions.items.filter(sub => {
        return sub.customer_id === customer_id;
      });
      
      console.log('Found subscriptions by customer ID:', customerSubscriptions.length);

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
        customer_id: sub.customer_id,
        product_id: sub.notes?.product_id || 'product1',
        total_count: sub.total_count,
        paid_count: sub.paid_count || 1,
        remaining_count: sub.remaining_count || (sub.total_count - (sub.paid_count || 1)),
        next_charge_at: sub.next_charge_at ? new Date(sub.next_charge_at * 1000).toISOString().split('T')[0] : null
      }));

      console.log('Formatted subscriptions by customer ID:', formattedSubscriptions);

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
    console.error('Error fetching subscriptions by customer ID:', error);
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
    const { customer_email, customer_id } = req.body;
    
    console.log('Fetching subscriptions for customer:', { customer_email, customer_id });
    
    if (!customer_email && !customer_id) {
      console.log('No customer email or ID provided');
      return res.status(400).json({ 
        success: false, 
        error: 'Customer email or ID is required' 
      });
    }

    // Fetch all subscriptions from Razorpay
    try {
      const subscriptions = await razorpay.subscriptions.all();
      
      // Filter subscriptions by email or customer ID
      let customerSubscriptions = [];
      
      if (customer_id) {
        // Primary filter by customer ID
        customerSubscriptions = subscriptions.items.filter(sub => {
          return sub.customer_id === customer_id;
        });
        console.log('Found subscriptions by customer ID:', customerSubscriptions.length);
      } else {
        // Fallback to email filter
        customerSubscriptions = subscriptions.items.filter(sub => {
          return sub.email === customer_email;
        });
        console.log('Found subscriptions by email:', customerSubscriptions.length);
      }
      
      // If no subscriptions found by ID, try email as fallback
      if (customerSubscriptions.length === 0 && customer_id && customer_email) {
        console.log('No subscriptions by ID, trying email fallback...');
        customerSubscriptions = subscriptions.items.filter(sub => {
          return sub.email === customer_email;
        });
        console.log('Found subscriptions by email fallback:', customerSubscriptions.length);
      }

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
        customer_id: sub.customer_id,
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

// Skip Subscription Payment
app.post('/api/subscriptions/skip', async (req, res) => {
  try {
    const { subscription_id } = req.body;

    if (!subscription_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Subscription ID is required' 
      });
    }

    console.log('Skipping payment for subscription:', subscription_id);

    // Skip the next payment
    const subscription = await razorpay.subscriptions.skip(subscription_id);

    console.log('Payment skipped successfully:', subscription.id);

    res.json({
      success: true,
      status: subscription.status,
      message: 'Next payment skipped successfully'
    });

  } catch (error) {
    console.error('Error skipping payment:', error);
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

    if (!subscription_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Subscription ID is required' 
      });
    }

    console.log('Resuming subscription:', subscription_id);

    // Resume the subscription
    const subscription = await razorpay.subscriptions.resume(
      subscription_id,
      { resume_at: 'now' }
    );

    console.log('Subscription resumed successfully:', subscription.id);

    res.json({
      success: true,
      status: subscription.status,
      message: 'Subscription resumed successfully'
    });

  } catch (error) {
    console.error('Error resuming subscription:', error);
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

    if (!subscription_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Subscription ID is required' 
      });
    }

    console.log('Cancelling subscription:', subscription_id);

    // Cancel the subscription
    const subscription = await razorpay.subscriptions.cancel(
      subscription_id,
      { cancel_at_cycle_end: false }
    );

    console.log('Subscription cancelled successfully:', subscription.id);

    res.json({
      success: true,
      status: subscription.status,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
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

// Test Shopify Connection
app.post('/api/test-shopify-connection', async (req, res) => {
  try {
    console.log('🔍 Testing Shopify connection...');
    
    if (!process.env.SHOPIFY_STORE_NAME || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Shopify credentials not configured'
      });
    }

    const shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/shop.json`;
    
    const response = await axios.get(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Shopify connection successful:', response.data.shop.name);
    
    res.json({
      success: true,
      message: 'Shopify connection successful',
      shop: {
        name: response.data.shop.name,
        domain: response.data.shop.domain,
        id: response.data.shop.id
      }
    });

  } catch (error) {
    console.error('❌ Shopify connection failed:', error.response?.data || error.message);
    res.status(400).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// Test Razorpay Connection
app.post('/api/test-razorpay-connection', async (req, res) => {
  try {
    console.log('🔍 Testing Razorpay connection...');
    
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY) {
      return res.status(400).json({
        success: false,
        error: 'Razorpay credentials not configured'
      });
    }

    // Test by fetching plans
    const plans = await razorpay.plans.all({
      count: 1,
      skip: 0
    });

    console.log('✅ Razorpay connection successful, found plans:', plans.items.length);
    
    res.json({
      success: true,
      message: 'Razorpay connection successful',
      plans_found: plans.items.length,
      test_plan: plans.items[0] ? {
        id: plans.items[0].id,
        name: plans.items[0].item?.name,
        amount: plans.items[0].item?.amount
      } : null
    });

  } catch (error) {
    console.error('❌ Razorpay connection failed:', error);
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
    
    // Parse JSON strings from notes if they exist
    let customerInfo = {};
    let shippingAddress = {};
    
    try {
      customerInfo = subscriptionData.notes?.customer_info ? 
        JSON.parse(subscriptionData.notes.customer_info) : {};
    } catch (e) {
      console.log('Could not parse customer_info from notes');
    }
    
    try {
      shippingAddress = subscriptionData.notes?.shipping_address ? 
        JSON.parse(subscriptionData.notes.shipping_address) : {};
    } catch (e) {
      console.log('Could not parse shipping_address from notes');
    }
    
    // Get customer info from parsed data or fallback to notes
    const customerEmail = customerInfo.email || subscriptionData.email || subscriptionData.notes?.customer_email;
    const customerPhone = customerInfo.phone || subscriptionData.phone || subscriptionData.notes?.customer_phone;
    const variantId = subscriptionData.notes?.variant_id || subscriptionData.product_id;
    
    // Extract address information from parsed data or use defaults
    const customerName = customerInfo.name || subscriptionData.notes?.customer_name || 'Customer Name';
    const firstName = customerInfo.first_name || subscriptionData.notes?.first_name || 'Customer';
    const lastName = customerInfo.last_name || subscriptionData.notes?.last_name || 'Name';
    const address = shippingAddress.address1 || subscriptionData.notes?.address || 'Default Address';
    const addressLine2 = shippingAddress.address2 || subscriptionData.notes?.address_line_2 || '';
    const city = shippingAddress.city || subscriptionData.notes?.city || 'Default City';
    const state = shippingAddress.state || subscriptionData.notes?.state || 'Default State';
    const postalCode = shippingAddress.postal_code || subscriptionData.notes?.postal_code || '000000';
    const country = shippingAddress.country || subscriptionData.notes?.country || 'IN';
    
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
            variant_id: getVariantId(variantId),
            quantity: 1,
            title: `${subscriptionData.plan_id} - Subscription`,
            price: (planAmount / 100).toString(), // Convert from paise to rupees
            taxable: true
          }
        ],
        note: `Subscription ID: ${subscriptionData.id} | Plan: ${subscriptionData.plan_id}`,
        tags: ['subscription', 'razorpay', 'active'],
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: address,
          address2: addressLine2,
          city: city,
          province: state,
          country: country,
          zip: postalCode
        },
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          address1: address,
          address2: addressLine2,
          city: city,
          province: state,
          country: country,
          zip: postalCode
        },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: customerEmail,
          phone: customerPhone
        }
      }
    };

    console.log('🛒 Creating Shopify order with address data:', {
      customerName,
      address,
      city,
      state,
      postalCode,
      country
    });

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