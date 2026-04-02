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
app.use(cors());

// Webhook needs raw body for signature verification — must come before express.json()
app.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body.toString('utf8');

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('❌ Webhook signature mismatch');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    console.log('✅ Razorpay webhook received:', event.event);

    // Handle subscription.charged — fires every time a payment is collected
    if (event.event === 'subscription.charged') {
      const payment = event.payload.payment.entity;
      const subscription = event.payload.subscription.entity;

      console.log('💳 Subscription charged:', {
        subscriptionId: subscription.id,
        paymentId: payment.id,
        amount: payment.amount
      });

      // Fetch full subscription to get notes with customer/address data
      const fullSubscription = await razorpay.subscriptions.fetch(subscription.id);

      try {
        const order = await createShopifyOrder(fullSubscription);
        console.log(`✅ Shopify order ${order.order_number} created for subscription ${subscription.id}`);
      } catch (orderErr) {
        console.error('❌ Shopify order creation failed:', orderErr.message);
        // Still return 200 so Razorpay doesn't retry endlessly
      }
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.use(express.json());

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
      // ENHANCED: Box and items selection
      boxes,
      items,
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
        frequency: frequency,
        // ENHANCED: Box and items selection
        boxes: boxes || 'One Box',
        items: items || 'Standard configuration'
      }).length);

    // Create Razorpay subscription directly (no initial payment - mandate flow)
    console.log('🔄 Creating subscription via direct HTTP call...');
    
    // Split data into multiple notes to stay under 255 character limit
    // Parse frequency integer from strings like "1", "1 Month", "Every 1 month"
    const freqInt = parseInt(frequency) || 1;

    const subscriptionData = {
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: 200, // effectively indefinite
      notes: {
        name: (customer_name || '').substring(0, 50),
        email: (customer_email || '').substring(0, 50),
        phone: (customer_phone || '').substring(0, 20),
        product_id: product_id,
        product_title: (product_title || 'Subscription').substring(0, 50),
        frequency: String(freqInt),
        boxes: (boxes || 'Not specified').substring(0, 60),
        items: (items || 'Standard configuration').substring(0, 80),
        address: (address || '').substring(0, 80),
        city: (city || '').substring(0, 30),
        state: (state || '').substring(0, 30),
        postal_code: (postal_code || '').substring(0, 10),
        country: country || 'IN',
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

// Mock Subscription Creation (Bypass Razorpay for testing)
app.post('/api/create-mock-subscription', async (req, res) => {
  try {
    console.log('🧪 Creating mock subscription (bypassing Razorpay)...');
    
    const {
      plan_id,
      customer_email,
      customer_phone,
      product_id,
      frequency,
      product_title,
      product_description,
      amount,
      boxes,
      items,
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

    console.log('Mock subscription data:', req.body);

    // Create a mock subscription response
    const mockSubscription = {
      id: 'sub_mock_' + Date.now(),
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: parseInt(frequency),
      start_at: Math.floor(Date.now() / 1000) + 60,
      expire_by: Math.floor(Date.now() / 1000) + (parseInt(frequency) * 30 * 24 * 60 * 60),
      status: 'created',
      notes: {
        name: customer_name?.substring(0, 50) || 'Test User',
        email: customer_email?.substring(0, 50) || 'test@example.com',
        phone: customer_phone?.substring(0, 20) || '+919876543210',
        product_id: product_id,
        product_title: product_title || 'Test Subscription',
        product_description: product_description || '',
        frequency: frequency,
        boxes: boxes || 'One Box',
        items: items || 'Standard configuration',
        address: address || '123 Test Street',
        city: city || 'Mumbai',
        state: state || 'Maharashtra',
        postal_code: postal_code || '400001',
        country: country || 'IN'
      }
    };

    console.log('✅ Mock subscription created:', mockSubscription.id);

    // Return success response
    res.json({
      success: true,
      subscription_id: mockSubscription.id,
      key_id: 'rzp_test_mock_key', // Mock key for frontend
      amount: (amount || 299) * 100, // Convert to paise
      status: mockSubscription.status,
      message: 'Mock subscription created - frontend flow working!',
      mock: true // Indicate this is a mock response
    });

  } catch (error) {
    console.error('❌ Mock subscription creation failed:', error);
    res.status(500).json({
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
          auth_attempts: sub.auth_attempts || 0,
          // ENHANCED: Box and items selection
          boxes: sub.notes?.boxes || 'Not specified',
          items: sub.notes?.items || 'Not specified'
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

// Called from frontend after Razorpay payment handler fires
app.post('/api/order-from-payment', async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      // Customer & address (sent from frontend since notes may be trimmed)
      customer_name,
      first_name,
      last_name,
      customer_email,
      customer_phone,
      address,
      address_line_2,
      city,
      state,
      postal_code,
      country,
      boxes,
      items,
      product_title,
      frequency,
      variant_id
    } = req.body;

    console.log('📦 order-from-payment called:', { razorpay_payment_id, razorpay_subscription_id });

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment details' });
    }

    // Verify signature: HMAC-SHA256(payment_id + "|" + subscription_id, secret)
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET_KEY)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('❌ Signature mismatch');
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    console.log('✅ Payment signature verified');

    // Fetch subscription from Razorpay to get plan details
    const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);

    // Merge frontend address data into subscription object so createShopifyOrder can use it
    subscription.notes = {
      ...subscription.notes,
      name: customer_name || `${first_name || ''} ${last_name || ''}`.trim(),
      email: customer_email,
      phone: customer_phone,
      address: address,
      address_line_2: address_line_2 || '',
      city: city,
      state: state,
      postal_code: postal_code,
      country: country || 'IN',
      boxes: boxes || subscription.notes?.boxes || 'Not specified',
      items: items || subscription.notes?.items || 'Standard configuration',
      product_title: product_title || subscription.notes?.product_title || 'Subscription',
      frequency: frequency || subscription.notes?.frequency || '1',
      product_id: variant_id || subscription.notes?.product_id || ''
    };

    const order = await createShopifyOrder(subscription);

    console.log('✅ Shopify order created after payment:', order.id);
    res.json({ success: true, order_id: order.id, order_number: order.order_number });

  } catch (error) {
    console.error('❌ order-from-payment failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shopify Order Creation Function
async function createShopifyOrder(subscriptionData) {
  try {
    // Fix Shopify URL construction - handle both cases
    let shopifyUrl;
    if (process.env.SHOPIFY_STORE_NAME.includes('.myshopify.com')) {
      shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}/admin/api/2023-10/orders.json`;
    } else {
      shopifyUrl = `https://${process.env.SHOPIFY_STORE_NAME}.myshopify.com/admin/api/2023-10/orders.json`;
    }
    
    console.log('🚀 Starting Shopify order creation process...');
    console.log('📋 Subscription data received:', {
      subscriptionId: subscriptionData.id,
      planId: subscriptionData.plan_id,
      status: subscriptionData.status,
      hasNotes: !!subscriptionData.notes,
      notesCount: Object.keys(subscriptionData.notes || {}).length
    });
    
    // First, fetch plan details to get correct amount
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
      console.log('⚠️ Could not fetch plan details, using fallback amount:', planError.message);
      planAmount = subscriptionData.amount || 1500; // Use amount from frontend or fallback
      console.log('🔄 Using fallback amount:', planAmount);
    }
    
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
    
    // Build Shopify order data (using original logic with enhanced notes)
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
        note: `📦 Box: ${subscriptionData.notes?.boxes || 'Not specified'}
🧴 Pads Selected: ${subscriptionData.notes?.items || 'Standard configuration'}
📅 Plan: ${subscriptionInfo.product_title || 'Not specified'}
🔁 Frequency: Every ${subscriptionInfo.frequency || '?'} month(s)
🆔 Subscription ID: ${subscriptionData.id}
👤 Customer: ${customerName}`,
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
      },
      // Add SSL certificate handling
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
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
    
    console.log('🔗 Shopify Order Link:', `https://${process.env.SHOPIFY_STORE_NAME.replace('.myshopify.com', '')}/admin/orders/${response.data.order.id}`);
    
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
