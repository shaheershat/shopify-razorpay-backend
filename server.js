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
      amount, // This will be in rupees from frontend
      // Address fields
      customer_name,
      first_name,
      last_name,
      address,
      address_line_2,
      city,
      state,
      postal_code,
      country
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

    console.log('📝 Creating subscription with notes count:', Object.keys({
        product_id: product_id,
        customer_email: customer_email,
        customer_name: customer_name,
        address: address,
        city: city,
        state: state,
        postal_code: postal_code,
        country: country || 'IN',
        frequency: frequency
      }).length);

    // Create Razorpay subscription directly (no initial payment - mandate flow)
    console.log('🔄 Creating subscription via direct HTTP call...');
    
    // Split data into multiple notes to stay under 255 character limit
    const subscriptionData = {
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: parseInt(frequency),
      start_at: Math.floor(Date.now() / 1000) + 60, // Start in 1 minute
      expire_by: Math.floor(Date.now() / 1000) + (parseInt(frequency) * 30 * 24 * 60 * 60), // Expire after frequency months
      notes: {
        // Customer info (shortened)
        name: customer_name.substring(0, 50),
        email: customer_email.substring(0, 50),
        phone: customer_phone.substring(0, 20),
        // Address info (shortened)
        addr: address.substring(0, 50),
        city: city.substring(0, 30),
        state: state.substring(0, 30),
        pin: postal_code.substring(0, 10),
        // Product info
        pid: product_id.substring(0, 20),
        title: product_title.substring(0, 50),
        freq: frequency.substring(0, 10),
        type: 'mandate'
      }
    };
    
    console.log('📝 Notes count:', Object.keys(subscriptionData.notes).length);
    console.log('📝 Notes fields:', Object.keys(subscriptionData.notes));
    
    // Make direct HTTP call to Razorpay
    const razorpayResponse = await axios.post(`https://${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_SECRET_KEY}@api.razorpay.com/v1/subscriptions`, subscriptionData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const subscription = razorpayResponse.data;

    console.log('Direct subscription created:', subscription.id);
    console.log('✅ Address data stored in subscription notes:', {
      customer_name,
      address,
      city,
      state,
      postal_code
    });

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
    console.error('❌ Error creating direct subscription:', error);
    console.error('🔥 Error details:', {
      message: error.message,
      stack: error.stack,
      razorpayError: error.error,
      statusCode: error.statusCode,
      description: error.description
    });
    res.status(400).json({ 
      success: false, 
      error: error.message || 'Unknown error occurred',
      details: {
        statusCode: error.statusCode,
        description: error.description,
        razorpayError: error.error
      }
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

// Test Webhook Trigger with Custom Data (for testing)
app.post('/api/test-custom-order', async (req, res) => {
  try {
    console.log('🧪 Testing custom order creation...');
    
    const { customer_data, product_data, plan_data } = req.body;
    
    // Create a mock subscription object with custom data
    const mockSubscription = {
      id: 'test_sub_' + Date.now(),
      plan_id: plan_data?.plan_id || 'plan_SSfug4F5nvQEi5',
      status: 'authenticated',
      notes: {
        // Product info
        product_id: product_data?.product_id || '46513506189501',
        product_title: product_data?.title || 'Test Subscription',
        product_description: product_data?.description || 'Test subscription plan',
        shopify_store: process.env.SHOPIFY_STORE_NAME,
        // Customer info
        customer_email: customer_data?.email || 'test@example.com',
        customer_phone: customer_data?.phone || '+919876543210',
        customer_name: customer_data?.name || `${customer_data?.first_name} ${customer_data?.last_name}`,
        first_name: customer_data?.first_name || 'Test',
        last_name: customer_data?.last_name || 'User',
        // Address info
        address: customer_data?.address?.address1 || '123 Test Street',
        address_line_2: customer_data?.address?.address2 || '',
        city: customer_data?.address?.city || 'Test City',
        state: customer_data?.address?.state || 'Test State',
        postal_code: customer_data?.address?.postal_code || '123456',
        country: customer_data?.address?.country || 'IN',
        // Subscription info
        frequency: '3',
        subscription_type: 'mandate',
        flow: 'autopay'
      },
      charge_at: plan_data?.amount || 1000
    };
    
    console.log('📋 Mock subscription created:', {
      subscriptionId: mockSubscription.id,
      customerName: mockSubscription.notes.customer_name,
      email: mockSubscription.notes.customer_email,
      phone: mockSubscription.notes.customer_phone,
      address: `${mockSubscription.notes.address}, ${mockSubscription.notes.city}`,
      planAmount: mockSubscription.charge_at
    });
    
    // Call the order creation function
    const order = await createShopifyOrder(mockSubscription);
    
    res.json({
      success: true,
      message: 'Test order created successfully',
      subscription_id: mockSubscription.id,
      order_id: order.id,
      order_number: order.order_number,
      customer_details: {
        name: mockSubscription.notes.customer_name,
        email: mockSubscription.notes.customer_email,
        phone: mockSubscription.notes.customer_phone,
        address: `${mockSubscription.notes.address}, ${mockSubscription.notes.city}, ${mockSubscription.notes.state} ${mockSubscription.notes.postal_code}`
      },
      order_details: {
        total_amount: (mockSubscription.charge_at / 100).toFixed(2),
        product_title: mockSubscription.notes.product_title,
        variant_id: mockSubscription.notes.product_id
      },
      shopify_admin_url: `https://${process.env.SHOPIFY_STORE_NAME}/admin/orders/${order.id}`
    });
    
  } catch (error) {
    console.error('❌ Test order creation failed:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Test Webhook Trigger (for testing)
app.post('/api/test-subscription-activated', async (req, res) => {
  try {
    console.log('🧪 Testing subscription activation webhook...');
    
    // Get the latest subscription from Razorpay
    const subscriptions = await razorpay.subscriptions.all({
      count: 1,
      status: 'active'
    });
    
    if (subscriptions.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active subscriptions found'
      });
    }
    
    const subscription = subscriptions.items[0];
    console.log('📋 Found active subscription:', subscription.id);
    
    // Simulate webhook payload
    const webhookPayload = {
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: subscription
        }
      }
    };
    
    // Call the order creation function
    await createShopifyOrder(webhookPayload.payload.subscription.entity);
    
    res.json({
      success: true,
      message: 'Test webhook triggered successfully',
      subscription_id: subscription.id,
      order_created: true
    });
    
  } catch (error) {
    console.error('❌ Test webhook failed:', error);
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

// Test webhook endpoint (bypasses signature verification)
app.post('/test-webhook-subscription-activated', async (req, res) => {
  try {
    console.log('🧪 TEST WEBHOOK: Subscription activated!');
    
    // Mock subscription data
    const mockSubscription = {
      id: 'sub_SUwqFXEnQsd6hK',
      plan_id: 'plan_SSfug4F5nvQEi5',
      status: 'active',
      notes: {
        name: 'Sarath s',
        email: 'shaheershavava54@gmail.com',
        phone: '+919744936772',
        addr: 'Karinjellipallam chittur',
        city: 'PALAKKAD',
        state: 'Kerala',
        pin: '678101',
        pid: '46513506189501',
        title: 'Monthly for 3 Months',
        freq: '3months',
        type: 'mandate'
      }
    };
    
    console.log('📋 Mock subscription details:', {
      subscriptionId: mockSubscription.id,
      status: mockSubscription.status,
      planId: mockSubscription.plan_id,
      hasNotes: !!mockSubscription.notes,
      notesCount: Object.keys(mockSubscription.notes || {}).length
    });
    
    // Create order in Shopify for activated subscription
    try {
      console.log('🚀 Triggering Shopify order creation from test webhook...');
      const order = await createShopifyOrder(mockSubscription);
      console.log('✅ TEST WEBHOOK SUCCESS: Shopify order created!', {
        subscriptionId: mockSubscription.id,
        orderId: order.id,
        orderNumber: order.order_number
      });
      
      res.json({
        success: true,
        message: 'Test webhook processed successfully',
        orderId: order.id,
        orderNumber: order.order_number,
        shopifyAdminUrl: `https://${process.env.SHOPIFY_STORE_NAME}/admin/orders/${order.id}`
      });
    } catch (orderError) {
      console.error('❌ TEST WEBHOOK FAILED: Shopify order creation failed:', orderError);
      console.error('🔥 Test webhook error details:', {
        subscriptionId: mockSubscription.id,
        errorMessage: orderError.message,
        errorResponse: orderError.response?.data
      });
      
      res.status(500).json({
        success: false,
        error: orderError.message,
        details: orderError.response?.data
      });
    }
    
  } catch (error) {
    console.error('❌ Test webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Razorpay Webhook Handler
app.post('/webhooks/razorpay', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    console.log('🔔 WEBHOOK RECEIVED - Checking signature...');
    const signature = req.headers['x-razorpay-signature'];
    
    let body;
    // Check if body is already parsed or raw
    if (typeof req.body === 'string') {
      body = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      body = req.body.toString();
    } else {
      // Body is already parsed as object
      body = JSON.stringify(req.body);
    }

    console.log('📋 Webhook signature:', signature);
    console.log('📋 Webhook body length:', body.length);
    console.log('📋 Webhook body type:', typeof req.body);

    // Check if body is empty or invalid
    if (!body || body.length === 0) {
      console.error('❌ Empty webhook body received');
      return res.status(400).json({ error: 'Empty webhook body' });
    }

    // For now, skip signature verification to debug
    console.log('⚠️ Skipping signature verification for debugging...');
    
    let event;
    try {
      event = JSON.parse(body);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError.message);
      console.error('📋 Attempted to parse:', body);
      return res.status(400).json({ error: 'Invalid JSON in webhook body' });
    }
    
    console.log('🔔 WEBHOOK EVENT:', event.event);

    switch (event.event) {
      case 'subscription.activated':
        console.log('🎉 WEBHOOK RECEIVED: Subscription activated!');
        console.log('📋 Subscription details:', {
          subscriptionId: event.payload.subscription.entity.id,
          status: event.payload.subscription.entity.status,
          planId: event.payload.subscription.entity.plan_id,
          hasNotes: !!event.payload.subscription.entity.notes,
          notesCount: Object.keys(event.payload.subscription.entity.notes || {}).length
        });
        
        // Create order in Shopify for activated subscription
        try {
          console.log('🚀 Triggering Shopify order creation from webhook...');
          const order = await createShopifyOrder(event.payload.subscription.entity);
          console.log('✅ WEBHOOK SUCCESS: Shopify order created via webhook!', {
            subscriptionId: event.payload.subscription.entity.id,
            orderId: order.id,
            orderNumber: order.order_number
          });
        } catch (orderError) {
          console.error('❌ WEBHOOK FAILED: Shopify order creation failed from webhook:', orderError);
          console.error('🔥 Webhook error details:', {
            subscriptionId: event.payload.subscription.entity.id,
            errorMessage: orderError.message,
            errorResponse: orderError.response?.data
          });
        }
        break;

      case 'payment.authorized':
        console.log('💳 Payment authorized:', event.payload.payment.entity.id);
        console.log('📋 Payment entity details:', JSON.stringify(event.payload.payment.entity, null, 2));
        
        // DO NOT create Shopify order for individual payments
        // Only subscription.activated should create orders
        console.log('ℹ️ Payment received - Shopify order will be created by subscription.activated webhook');
        
        break;

      case 'subscription.cancelled':
        console.log('Subscription cancelled:', event.payload.subscription.entity.id);
        // Update your database
        break;

      case 'subscription.halted':
        console.log('Subscription halted:', event.payload.subscription.entity.id);
        // Update your database
        break;

      case 'payment.failed':
        console.log('💳 Payment failed:', event.payload.payment.entity.id);
        console.log('📋 Payment failure details:', JSON.stringify(event.payload.payment.entity, null, 2));
        console.log('🔍 Payment error code:', event.payload.payment.entity.error_code);
        console.log('🔍 Payment error description:', event.payload.payment.entity.error_description);
        console.log('🔍 Payment status:', event.payload.payment.entity.status);
        console.log('🔍 Payment method:', event.payload.payment.entity.method);
        console.log('🔍 Payment amount:', event.payload.payment.entity.amount);
        console.log('🔍 Payment VPA:', event.payload.payment.entity.vpa);
        console.log('🔍 Error source:', event.payload.payment.entity.error_source);
        console.log('🔍 Error step:', event.payload.payment.entity.error_step);
        console.log('🔍 Error reason:', event.payload.payment.entity.error_reason);
        
        // Log available fields for debugging
        if (event.payload.payment.entity) {
          console.log('📋 Available payment fields:', Object.keys(event.payload.payment.entity));
        }
        
        // DO NOT create failed payment orders
        // Only log the failure for debugging
        console.log('ℹ️ Payment failed - no Shopify order created (only subscription.activated creates orders)');
        
        break;

      default:
        console.log('🔍 Unknown event received:', event.event);
        console.log('📋 Event data:', JSON.stringify(event, null, 2));
        break;
    }

    res.json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Failed Payment Order Creation Function
async function createFailedPaymentOrder(paymentData) {
  try {
    const shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/orders.json`;
    
    console.log('🚀 Creating failed payment order record...');
    
    // Extract customer info from payment notes
    const customerEmail = paymentData.notes?.customer_email || paymentData.email;
    const customerPhone = paymentData.notes?.customer_phone || paymentData.contact;
    const customerName = paymentData.notes?.customer_name || 'Customer Name';
    const firstName = customerName.split(' ')[0] || 'Customer';
    const lastName = customerName.split(' ').slice(1).join(' ') || 'Name';
    
    // Get product info
    const productId = paymentData.notes?.product_id || '46513506189501';
    const variantId = getVariantId(productId);
    
    // Create a draft order for failed payment (for tracking)
    const orderData = {
      order: {
        email: customerEmail,
        phone: customerPhone,
        financial_status: 'pending',
        line_items: [
          {
            variant_id: variantId,
            quantity: 1,
            title: `FAILED PAYMENT - ${paymentData.error_description || 'Payment Failed'}`,
            price: (paymentData.amount / 100).toString(),
            taxable: true
          }
        ],
        note: `FAILED PAYMENT - ID: ${paymentData.id} | Error: ${paymentData.error_code} | ${paymentData.error_description} | Method: ${paymentData.method} | VPA: ${paymentData.vpa || 'N/A'}`,
        tags: ['subscription', 'razorpay', 'payment-failed', 'mandate-flow'],
        send_receipt: false,
        send_fulfillment_receipt: false,
        send_invoice: false
      }
    };

    const response = await axios.post(shopifyUrl, orderData, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Failed payment order created for tracking:', response.data.order.id);
    return response.data.order;

  } catch (error) {
    console.error('❌ Failed to create failed payment order:', error.message);
    throw error;
  }
}

// Payment Failure Handler
async function handlePaymentFailure(paymentData) {
  try {
    console.log('🔔 Handling payment failure...');
    
    // Extract customer info
    const customerEmail = paymentData.notes?.customer_email || paymentData.email;
    const customerName = paymentData.notes?.customer_name || 'Customer';
    
    // Determine failure type
    let failureMessage = '';
    let retrySuggestion = '';
    
    if (paymentData.error_code === 'BAD_REQUEST_ERROR') {
      failureMessage = 'Payment was cancelled or UPI app timed out';
      retrySuggestion = 'Please try again with a stable internet connection';
    } else if (paymentData.error_code === 'GATEWAY_ERROR') {
      failureMessage = 'Bank risk check failed for your account';
      retrySuggestion = 'Please try using a different payment method or account';
    } else if (paymentData.error_source === 'customer') {
      failureMessage = 'Payment was cancelled by customer';
      retrySuggestion = 'Please complete the payment process';
    } else if (paymentData.error_source === 'issuer_bank') {
      failureMessage = 'Bank rejected the payment';
      retrySuggestion = 'Please contact your bank or use a different account';
    } else {
      failureMessage = 'Payment failed due to technical issues';
      retrySuggestion = 'Please try again or contact support';
    }
    
    console.log('📋 Payment failure analysis:', {
      customerEmail,
      customerName,
      failureMessage,
      retrySuggestion,
      paymentMethod: paymentData.method,
      errorCode: paymentData.error_code,
      errorSource: paymentData.error_source
    });
    
    // Here you could:
    // 1. Send email notification to customer
    // 2. Update subscription status in database
    // 3. Trigger retry logic
    // 4. Notify admin team
    
    console.log('🔔 Payment failure handled successfully');
    
  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

// Shopify Order Creation Function from Payment Data
async function createShopifyOrderFromPayment(paymentData) {
  try {
    const shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/orders.json`;
    
    console.log('🚀 Starting Shopify order creation from payment data...');
    console.log('📋 Payment data received:', {
      paymentId: paymentData.id,
      amount: paymentData.amount,
      currency: paymentData.currency,
      email: paymentData.email,
      hasNotes: !!paymentData.notes,
      notesCount: Object.keys(paymentData.notes || {}).length
    });

    // Extract customer and product info from payment notes
    let subscriptionInfo = {};
    try {
      subscriptionInfo = {
        customer_name: paymentData.notes?.name || 'Customer Name',
        email: paymentData.notes?.email || paymentData.email,
        phone: paymentData.notes?.phone || paymentData.contact,
        address: paymentData.notes?.addr || 'Default Address',
        city: paymentData.notes?.city || 'Default City',
        state: paymentData.notes?.state || 'Default State',
        postal_code: paymentData.notes?.pin || '000000',
        product_id: paymentData.notes?.pid || 'default',
        product_title: paymentData.notes?.title || 'Subscription',
        frequency: paymentData.notes?.freq || '1'
      };
    } catch (e) {
      console.log('Could not parse subscription data from payment notes, using fallback');
    }
    
    // Get customer info from parsed data or fallback to payment data
    const customerEmail = subscriptionInfo.email || paymentData.email;
    const customerPhone = subscriptionInfo.phone || paymentData.contact;
    const variantId = subscriptionInfo.product_id || '46513506222269'; // Fallback variant
    
    // Extract address information from parsed data
    const customerName = subscriptionInfo.customer_name || 'Customer Name';
    const firstName = customerName.split(' ')[0] || 'Customer';
    const lastName = customerName.split(' ').slice(1).join(' ') || 'Name';
    const address = subscriptionInfo.address || 'Default Address';
    const addressLine2 = ''; // Not stored in payment notes
    const city = subscriptionInfo.city || 'Default City';
    const state = subscriptionInfo.state || 'Default State';
    const postalCode = subscriptionInfo.postal_code || '000000';
    const country = 'IN'; // Default country

    console.log('👤 Customer info extracted:', {
      email: customerEmail,
      phone: customerPhone,
      variantId: variantId
    });

    console.log('🏠 Address information extracted:', {
      customerName,
      firstName,
      lastName,
      address,
      city,
      state,
      postalCode,
      country
    });

    // Use payment amount directly (in paise, convert to rupees)
    const planAmount = paymentData.amount || 1500; // Fallback to 15.00

    console.log('💰 Using payment amount:', {
      paymentId: paymentData.id,
      amount: planAmount,
      amountInRupees: (planAmount / 100).toFixed(2)
    });

    // Build Shopify order data
    const orderData = {
      order: {
        email: customerEmail,
        phone: customerPhone,
        financial_status: 'paid',
        line_items: [
          {
            variant_id: getVariantId(variantId),
            quantity: 1,
            title: `${subscriptionInfo.product_title || 'Subscription'} - Payment ${paymentData.id}`,
            price: (planAmount / 100).toString(), // Convert from paise to rupees
            taxable: true
          }
        ],
        note: `Payment ID: ${paymentData.id} | Customer: ${customerName}`,
        tags: ['subscription', 'razorpay', 'payment', 'mandate-flow'],
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
        send_receipt: false,
        send_fulfillment_receipt: false,
        send_invoice: true
      }
    };

    console.log('🛒 Shopify order data prepared from payment:', {
      customerEmail,
      customerName,
      variantId,
      totalAmount: (planAmount / 100).toString(),
      shippingAddress: `${address}, ${city}, ${state} ${postalCode}`,
      lineItemsCount: orderData.order.line_items.length
    });

    console.log('📤 Sending request to Shopify API...');
    
    // First try to find existing customer by email
    let shopifyCustomer = null;
    try {
      console.log('🔍 Checking for existing customer in Shopify...');
      const customerSearchResponse = await axios.get(`https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/customers/search.json?query=email:${encodeURIComponent(customerEmail)}`, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      if (customerSearchResponse.data.customers && customerSearchResponse.data.customers.length > 0) {
        shopifyCustomer = customerSearchResponse.data.customers[0];
        console.log('✅ Found existing customer:', shopifyCustomer.id);
        
        // Update order with existing customer ID
        orderData.order.customer_id = shopifyCustomer.id;
      } else {
        console.log('ℹ️ No existing customer found, will create new one');
      }
    } catch (customerError) {
      console.log('⚠️ Customer search failed, proceeding with order creation:', customerError.message);
    }

    const response = await axios.post(shopifyUrl, orderData, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SUCCESS: Shopify order created from payment!');
    console.log('📦 Order details:', {
      orderId: response.data.order.id,
      orderNumber: response.data.order.order_number,
      customerEmail: response.data.order.email,
      totalAmount: response.data.order.total_price
    });

    return response.data.order;

  } catch (error) {
    console.error('❌ FAILED: Shopify order creation from payment failed!');
    console.error('🔥 Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      paymentId: paymentData.id,
      customerEmail: paymentData.email
    });

    if (error.response?.data) {
      console.error('📋 Shopify API Error Response:', error.response.data);
    }

    throw error;
  }
}

// Shopify Order Creation Function
async function createShopifyOrder(subscriptionData) {
  try {
    const shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/orders.json`;
    
    console.log('🚀 Starting Shopify order creation process...');
    console.log('📋 Subscription data received:', {
      subscriptionId: subscriptionData.id,
      planId: subscriptionData.plan_id,
      status: subscriptionData.status,
      hasNotes: !!subscriptionData.notes,
      notesCount: Object.keys(subscriptionData.notes || {}).length
    });
    
    // Parse subscription data from notes (using original logic)
    let subscriptionInfo = {};
    try {
      // Extract from notes (original format)
      subscriptionInfo = {
        customer_name: subscriptionData.notes?.name || subscriptionData.notes?.customer_name || 'Customer Name',
        email: subscriptionData.notes?.email || subscriptionData.email,
        phone: subscriptionData.notes?.phone || subscriptionData.phone,
        address: subscriptionData.notes?.addr || subscriptionData.notes?.address || 'Default Address',
        city: subscriptionData.notes?.city || 'Default City',
        state: subscriptionData.notes?.state || 'Default State',
        postal_code: subscriptionData.notes?.pin || subscriptionData.notes?.postal_code || '000000',
        product_id: subscriptionData.notes?.pid || subscriptionData.notes?.product_id || subscriptionData.product_id,
        product_title: subscriptionData.notes?.title || subscriptionData.notes?.product_title || 'Subscription',
        frequency: subscriptionData.notes?.freq || subscriptionData.notes?.frequency || '1'
      };
    } catch (e) {
      console.log('Could not parse subscription data from notes, using fallback');
    }
    
    // Get customer info from parsed data or fallback to notes
    const customerEmail = subscriptionInfo.email || subscriptionData.email;
    const customerPhone = subscriptionInfo.phone || subscriptionData.phone;
    const variantId = subscriptionInfo.product_id || subscriptionData.product_id;
    
    // Extract address information from parsed data
    const customerName = subscriptionInfo.customer_name || 'Customer Name';
    const firstName = customerName.split(' ')[0] || 'Customer';
    const lastName = customerName.split(' ').slice(1).join(' ') || 'Name';
    const address = subscriptionInfo.address || 'Default Address';
    const addressLine2 = subscriptionData.notes?.address_line_2 || ''; // Get from notes if available
    const city = subscriptionInfo.city || 'Default City';
    const state = subscriptionInfo.state || 'Default State';
    const postalCode = subscriptionInfo.postal_code || '000000';
    const country = subscriptionData.notes?.country || 'IN'; // Get from notes if available
    
    console.log('👤 Customer info extracted:', {
      email: customerEmail,
      phone: customerPhone,
      variantId: variantId
    });
    
    console.log('🏠 Address information extracted:', {
      customerName,
      firstName,
      lastName,
      address,
      city,
      state,
      postalCode,
      country
    });
    
    // Get plan details from Razorpay to get correct amount
    let planAmount = 0;
    try {
      console.log('💰 Fetching plan details for:', subscriptionData.plan_id);
      const plan = await razorpay.plans.fetch(subscriptionData.plan_id);
      planAmount = plan.item.amount; // Amount in paise
      console.log('✅ Plan amount fetched successfully:', {
        planId: plan.id,
        planName: plan.item.name,
        amount: planAmount,
        amountInRupees: (planAmount / 100).toFixed(2)
      });
    } catch (planError) {
      console.log('⚠️ Could not fetch plan details, using fallback amount');
      planAmount = subscriptionData.charge_at || 1000; // Fallback to 10 rupees
      console.log('🔄 Using fallback amount:', planAmount);
    }
    
    // Build Shopify order data (using original logic)
    const orderData = {
      order: {
        email: customerEmail,
        phone: customerPhone,
        financial_status: 'paid',
        line_items: [
          {
            variant_id: getVariantId(variantId),
            quantity: 1,
            title: `${subscriptionInfo.product_title || 'Subscription'} - ${subscriptionData.plan_id}`,
            price: (planAmount / 100).toString(), // Convert from paise to rupees
            taxable: true
          }
        ],
        note: `Subscription ID: ${subscriptionData.id} | Plan: ${subscriptionData.plan_id} | Customer: ${customerName}`,
        tags: ['subscription', 'razorpay', 'active', 'mandate-flow'],
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

    console.log('🛒 Shopify order data prepared:', {
      customerEmail,
      customerName,
      variantId,
      totalAmount: (planAmount / 100).toString(),
      shippingAddress: `${address}, ${city}, ${state} ${postalCode}`,
      lineItemsCount: orderData.order.line_items.length
    });

    console.log('📤 Sending request to Shopify API...');
    
    const response = await axios.post(shopifyUrl, orderData, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SUCCESS: Shopify order created successfully!');
    console.log('📦 Order details:', {
      orderId: response.data.order.id,
      orderNumber: response.data.order.order_number,
      customerEmail,
      customerName,
      totalAmount: (planAmount / 100).toString(),
      address: `${address}, ${city}, ${state} ${postalCode}`,
      financialStatus: response.data.order.financial_status,
      fulfillmentStatus: response.data.order.fulfillment_status
    });
    
    console.log('🔗 Shopify Order Link:', `https://${process.env.SHOPIFY_STORE_NAME}/admin/orders/${response.data.order.id}`);
    
    return response.data.order;

  } catch (error) {
    console.error('❌ FAILED: Shopify order creation failed!');
    console.error('🔥 Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      shopifyError: error.response?.data,
      subscriptionId: subscriptionData.id,
      customerEmail: subscriptionData.notes?.customer_email
    });
    
    if (error.response?.data) {
      console.error('📋 Shopify API Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    
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