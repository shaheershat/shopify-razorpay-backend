// Subscription Product JavaScript - Mandate Flow (No Initial Payment)
console.log('🔥 subscription-product-mandate.js loaded!');

class SubscriptionProduct {
  constructor() {
    console.log('🔥 SubscriptionProduct constructor called!');
    
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    this.razorpayKeyId = window.subscriptionConfig?.razorpay_key_id || 'rzp_live_SSfTeiwakEqpU0';
    this.customerEmail = window.subscriptionConfig?.customerEmail;
    this.customerPhone = window.subscriptionConfig?.customerPhone;
    
    console.log('🔥 Config:', {
      apiBase: this.apiBase,
      razorpayKeyId: this.razorpayKeyId,
      customerEmail: this.customerEmail
    });
    
    this.selectedPlan = null;
    this.cart = [];
    
    // Test backend connection first
    this.testBackendConnection();
    
    // Wait for Razorpay SDK to load
    setTimeout(() => {
      this.checkRazorpaySDK();
    }, 1000);
  }
  
  async testBackendConnection() {
    try {
      console.log('🔥 Testing backend connection...');
      const response = await fetch(`${this.apiBase}/health`);
      const data = await response.json();
      console.log('✅ Backend connection successful:', data);
    } catch (error) {
      console.error('❌ Backend connection failed:', error);
      this.showNotification('Backend server not accessible. Please try again.', 'error');
    }
  }
  
  checkRazorpaySDK() {
    console.log('🔥 Checking Razorpay SDK...');
    
    if (typeof Razorpay === 'undefined') {
      console.error('❌ Razorpay SDK not loaded');
      this.showNotification('Payment gateway not available', 'error');
    } else {
      console.log('✅ Razorpay SDK loaded');
      this.init();
    }
  }
  
  init() {
    console.log('🔥 Initializing SubscriptionProduct...');
    
    this.initializeSubscriptionOptions();
    this.initializeButtons();
    this.updateButtonStates();
    
    console.log('🔥 SubscriptionProduct initialized!');
  }
  
  initializeSubscriptionOptions() {
    console.log('🔥 Initializing subscription options...');
    
    const options = document.querySelectorAll('.subscription-option');
    console.log('🔥 Found subscription options:', options.length);
    console.log('🔥 Options:', options);
    
    options.forEach((option, index) => {
      console.log(`🔥 Adding click listener to option ${index}:`, option);
      option.addEventListener('click', () => {
        console.log(`🔥 Option ${index} clicked!`);
        this.selectPlan(option);
      });
    });
    
    if (options.length === 0) {
      console.error('❌ No subscription options found! Check if product has subscription variants with metafields.');
    }
  }
  
  selectPlan(option) {
    console.log('🔥 selectPlan called with:', option);
    
    // Remove previous selection
    document.querySelectorAll('.subscription-option').forEach(opt => {
      opt.classList.remove('border-blue-500', 'bg-blue-50');
    });
    
    // Add selection to clicked option
    option.classList.add('border-blue-500', 'bg-blue-50');
    
    // Store selected plan data
    this.selectedPlan = {
      variantId: option.dataset.variantId,
      planId: option.dataset.planId,
      frequency: option.dataset.plan,
      price: parseFloat(option.dataset.price) / 100, // Convert from cents to rupees
      name: option.querySelector('h4')?.textContent || 'Unknown Plan',
      description: option.querySelector('.text-gray-600')?.textContent || ''
    };
    
    console.log('🔥 Selected plan:', this.selectedPlan);
    this.updateButtonStates();
  }
  
  initializeButtons() {
    console.log('🔥 Initializing buttons...');
    
    const subscribeBtn = document.getElementById('subscribeNowBtn');
    console.log('🔥 Subscribe button found:', subscribeBtn);
    
    if (subscribeBtn) {
      subscribeBtn.addEventListener('click', () => {
        console.log('🔥 Subscribe button clicked!');
        this.createSubscription();
      });
      console.log('🔥 Subscribe button event listener added');
    } else {
      console.error('🔥 Subscribe button not found!');
    }
    
    // Enable buttons when customer info is filled
    const emailInput = document.getElementById('customerEmail');
    const phoneInput = document.getElementById('customerPhone');
    
    console.log('🔥 Email input found:', emailInput);
    console.log('🔥 Phone input found:', phoneInput);
    
    if (emailInput) emailInput.addEventListener('input', () => this.updateButtonStates());
    if (phoneInput) phoneInput.addEventListener('input', () => this.updateButtonStates());
    
    console.log('🔥 Buttons initialized!');
  }
  
  updateButtonStates() {
    const email = document.getElementById('customerEmail').value;
    const phone = document.getElementById('customerPhone').value;
    const hasValidInfo = email && phone && this.selectedPlan;
    
    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    
    if (subscribeNowBtn) subscribeNowBtn.disabled = !hasValidInfo;
  }
  
  async createSubscription() {
    try {
      if (!this.selectedPlan) {
        this.showNotification('Please select a subscription plan', 'error');
        return;
      }

      const customerEmail = this.customerEmail || document.getElementById('customerEmail')?.value;
      const customerPhone = this.customerPhone || document.getElementById('customerPhone')?.value;

      if (!customerEmail || !customerPhone) {
        this.showNotification('Please fill in your email and phone number', 'error');
        return;
      }

      console.log('🚀 Starting subscription flow with:', {
        planId: this.selectedPlan.planId,
        customerEmail,
        customerPhone,
        amount: this.selectedPlan.price // Use price from selected plan (in rupees)
      });

      // Show loading
      this.showNotification('Creating subscription...', 'info');
      
      // Step 1: Create Razorpay subscription first (mandate flow)
      const response = await fetch(`${this.apiBase}/api/create-subscription-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: this.selectedPlan.planId,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          product_id: this.selectedPlan.variantId,
          frequency: this.selectedPlan.frequency,
          product_title: this.selectedPlan.name,
          product_description: this.selectedPlan.description,
          amount: this.selectedPlan.price
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API error response:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('📊 API response data:', result);

      if (result.success) {
        console.log('✅ Subscription created, opening Razorpay subscription checkout...');
        console.log('💰 Plan amount from backend:', result.amount);
        // Step 2: Open Razorpay checkout to AUTHENTICATE subscription (mandate flow)
        this.openRazorpaySubscriptionCheckout(result.subscription_id, result.key_id, result.amount);
      } else {
        console.error('❌ API error:', result.error);
        this.showNotification(`Failed to create subscription: ${result.error}`, 'error');
      }

    } catch (error) {
      console.error('❌ Subscription creation error:', error);
      this.showNotification(`Failed to start subscription: ${error.message}`, 'error');
    }
  }
  
  openRazorpayCheckout(orderId, subscriptionId, keyId, amount) {
    console.log('💳 Opening Razorpay SUBSCRIPTION checkout (not Magic Checkout):', {
      subscriptionId,
      keyId,
      amount,
      selectedPlan: this.selectedPlan
    });

    // Use SUBSCRIPTION checkout - bypass Magic Checkout completely
    this.openRazorpaySubscriptionCheckout(subscriptionId, keyId, amount);
  }
  
  openRazorpaySubscriptionCheckout(subscriptionId, keyId, amount) {
    console.log('🚀 Opening Razorpay subscription checkout (mandate flow)...');
    console.log('💰 Using amount from plan:', amount);
    
    // Check if Razorpay is available
    if (typeof Razorpay === 'undefined') {
      console.error('❌ Razorpay not available');
      this.showNotification('Payment gateway not available', 'error');
      return;
    }
    
    // PURE SUBSCRIPTION CHECKOUT - bypasses Magic Checkout completely
    const options = {
      key: keyId, // Use key from backend
      subscription_id: subscriptionId, // Use subscription_id, not order_id
      name: 'Luvwish Subscription',
      description: `${this.selectedPlan.name} - ${this.selectedPlan.description}`,
      image: 'https://luvwish.in/cdn/shop/files/Logo_1_250x250.png',
      amount: amount, // Use actual plan amount from backend (already in paise)
      handler: (response) => {
        console.log('✅ Subscription payment completed:', response);
        
        // For subscription flow, we get razorpay_subscription_id and razorpay_payment_id
        if (response.razorpay_subscription_id && response.razorpay_payment_id) {
          console.log('🎉 Subscription activated successfully!');
          this.showNotification('Subscription activated successfully!', 'success');
          
          // Redirect to subscription management page after 2 seconds
          setTimeout(() => {
            window.location.href = '/pages/subscription-management';
          }, 2000);
        } else {
          console.error('❌ Invalid subscription response:', response);
          this.showNotification('Subscription activation failed', 'error');
        }
      },
      modal: {
        ondismiss: () => {
          console.log('❌ Subscription modal dismissed');
          this.showNotification('Subscription setup cancelled', 'warning');
        },
        escape: true,
        backdropclose: false,
        handleback: true,
        confirm_close: true,
        animation: 'fade'
      },
      notes: {
        subscription_type: 'mandate',
        flow: 'autopay',
        plan_name: this.selectedPlan.name,
        plan_price: this.selectedPlan.price,
        variant_id: this.selectedPlan.variantId,
        subscription_id: subscriptionId,
        timestamp: Date.now()
      },
      theme: {
        color: '#3399cc',
        backdrop_color: '#ffffff'
      },
      prefill: {
        email: this.customerEmail || '',
        contact: this.customerPhone || ''
      },
      readonly: {
        email: false,
        contact: false
      }
    };

    console.log('🔧 Razorpay SUBSCRIPTION options:', options);
    console.log('🔍 Using subscription_id:', subscriptionId);
    console.log('💰 Amount:', amount);
    console.log('🚀 Opening SUBSCRIPTION checkout (mandate flow) - NO Magic Checkout!');
    
    try {
      // Create new Razorpay instance for SUBSCRIPTION
      const rzp = new Razorpay(options);
      console.log('✅ Razorpay subscription instance created successfully');
      console.log('🚀 Opening Razorpay SUBSCRIPTION modal...');
      
      // Open subscription modal (this will show mandate flow)
      rzp.open();
      
      // Check if modal opened
      setTimeout(() => {
        const modal = document.querySelector('.razorpay-container');
        if (modal) {
          console.log('✅ Razorpay subscription modal opened successfully');
          console.log('🎯 This is MANDATE flow - no immediate payment');
        } else {
          console.warn('⚠️ Razorpay modal not found, trying to open again...');
          // Try once more
          rzp.open();
        }
      }, 500);
      
    } catch (error) {
      console.error('❌ Error opening Razorpay subscription:', error);
      this.showNotification(`Failed to open subscription: ${error.message}`, 'error');
    }
  }
  
  async verifyPaymentAndActivateSubscription(paymentId, orderId, signature, subscriptionId) {
    try {
      console.log('🔍 Verifying payment and activating subscription...');
      
      const response = await fetch(`${this.apiBase}/api/verify-payment-and-activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify({
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          razorpay_signature: signature,
          subscription_id: subscriptionId
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Subscription activated successfully!');
        this.showNotification('Subscription activated successfully!', 'success');
        
        // Redirect to subscription management page after 2 seconds
        setTimeout(() => {
          window.location.href = '/pages/subscription-management';
        }, 2000);
      } else {
        console.error('❌ Failed to activate subscription:', result.error);
        this.showNotification(`Failed to activate subscription: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('❌ Payment verification error:', error);
      this.showNotification('Payment verification failed', 'error');
    }
  }
  
  showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.subscriptionProduct = new SubscriptionProduct();
});
