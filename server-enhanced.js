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
      country,
      // ENHANCED: Box and items selection
      box_selection,
      items_selection,
      selected_plan
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
        box_selection: box_selection,
        items_selection: items_selection,
        selected_plan: selected_plan
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
        type: 'mandate',
        // ENHANCED: Box and items selection (shortened)
        boxes: box_selection.substring(0, 30),
        items: items_selection.substring(0, 50),
        plan_name: selected_plan.substring(0, 30)
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
      postal_code,
      // ENHANCED: Log box and items selection
      box_selection,
      items_selection,
      selected_plan
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

// Enhanced Test Order Creation (Like Old Code + New Features)
app.post('/api/test-enhanced-order', async (req, res) => {
  try {
    console.log('🧪 Testing enhanced order creation (old code + new features)...');
    
    const { customer_data, product_data, plan_data, box_selection, items_selection, selected_plan } = req.body;
    
    // Create a mock subscription object with enhanced data (like your old code)
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
        city: customer_data?.address?.city || 'Mumbai',
        state: customer_data?.address?.state || 'Maharashtra',
        postal_code: customer_data?.address?.postal_code || '400001',
        country: customer_data?.address?.country || 'IN',
        // Subscription info
        frequency: plan_data?.frequency || '3',
        subscription_type: 'mandate',
        flow: 'autopay',
        
        // ENHANCED: Box and items selection from cart (like your old code)
        boxes: box_selection || 'Two Boxes',
        items: items_selection || '2 M pads, 6 L pads, 4 XL pads',
        selected_plan: selected_plan || plan_data?.plan_name || '3 Months Plan'
      },
      charge_at: plan_data?.amount || 29900 // Amount in paise (₹299.00)
    };
    
    console.log('📋 Enhanced mock subscription created:', {
      subscriptionId: mockSubscription.id,
      customerName: mockSubscription.notes.customer_name,
      email: mockSubscription.notes.customer_email,
      phone: mockSubscription.notes.customer_phone,
      address: `${mockSubscription.notes.address}, ${mockSubscription.notes.city}`,
      planAmount: mockSubscription.charge_at,
      // ENHANCED: Log new features
      boxes: mockSubscription.notes.boxes,
      items: mockSubscription.notes.items,
      selectedPlan: mockSubscription.notes.selected_plan
    });
    
    // Create Shopify order using your old code structure but with enhanced features
    const order = await createShopifyOrder(mockSubscription);
    
    res.json({
      success: true,
      message: 'Enhanced test order created successfully (old code + new features)',
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
      // ENHANCED: Include new features in response
      enhanced_details: {
        box_selection: mockSubscription.notes.boxes,
        items_selection: mockSubscription.notes.items,
        selected_plan: mockSubscription.notes.selected_plan,
        frequency: mockSubscription.notes.frequency
      },
      shopify_admin_url: `https://${process.env.SHOPIFY_STORE_NAME}/admin/orders/${order.id}` 
    });
    
  } catch (error) {
    console.error('❌ Enhanced test order creation failed:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Get Customer Subscriptions by Notes Matching (Enhanced)
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
          // ENHANCED: Include box and items selection from notes
          box_selection: sub.notes?.boxes || 'Not specified',
          items_selection: sub.notes?.items || 'Not specified',
          selected_plan: sub.notes?.selected_plan || sub.notes?.plan_name || 'Not specified'
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

// Shopify Order Creation Function (Enhanced - Old Code + New Features)
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
    
    // Parse subscription data from notes (using original logic + enhanced features)
    let subscriptionInfo = {};
    try {
      // Extract from notes (original format + enhanced features)
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
        frequency: subscriptionData.notes?.freq || subscriptionData.notes?.frequency || '1',
        // ENHANCED: Box and items selection
        boxes: subscriptionData.notes?.boxes || 'Not specified',
        items: subscriptionData.notes?.items || 'Not specified',
        selected_plan: subscriptionData.notes?.selected_plan || subscriptionData.notes?.plan_name || 'Not specified'
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
    
    // Build Shopify order data (using original logic + enhanced features)
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
        // ENHANCED: Include box and items selection in order notes
        note: `📦 Box Selection: ${subscriptionInfo.boxes || 'Not specified'}
📋 Items Selected: ${subscriptionInfo.items || 'Not specified'}
📅 Subscription Plan: ${subscriptionInfo.selected_plan || 'Not specified'}
📋 Frequency: ${subscriptionInfo.frequency || 'Not specified'}
💰 Payment ID: ${subscriptionData.id}
👤 Customer: ${customerName}
📍 Address: ${address}, ${city}, ${state} ${postalCode}`,
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

    console.log('🛒 Shopify order data prepared (enhanced):', {
      customerEmail,
      customerName,
      variantId,
      totalAmount: (planAmount / 100).toString(),
      shippingAddress: `${address}, ${city}, ${state} ${postalCode}`,
      lineItemsCount: orderData.order.line_items.length,
      // ENHANCED: Log new features
      boxSelection: subscriptionInfo.boxes,
      itemsSelection: subscriptionInfo.items,
      selectedPlan: subscriptionInfo.selected_plan
    });

    console.log('📤 Sending request to Shopify API...');
    
    const response = await axios.post(shopifyUrl, orderData, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
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
  // Use actual variant ID passed from frontend
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
  console.log('✓ Enhanced server ready with old code structure + new features!');
});
