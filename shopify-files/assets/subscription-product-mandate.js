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
      price: parseFloat(option.dataset.price),
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
      console.log('🚀 Starting subscription creation (mandate flow)...');
      this.showNotification('Creating subscription...', 'info');
      
      if (!this.selectedPlan) {
        console.error('❌ No plan selected');
        this.showNotification('Please select a subscription plan', 'error');
        return;
      }

      // Get customer info
      const customerEmail = document.getElementById('customerEmail')?.value;
      const customerPhone = document.getElementById('customerPhone')?.value;
      
      console.log('👤 Customer info:', {
        email: customerEmail,
        phone: customerPhone
      });

      if (!customerEmail) {
        console.error('❌ No customer email');
        this.showNotification('Please enter your email', 'error');
        return;
      }

      // Create subscription via backend (mandate flow - no initial payment)
      console.log('🌐 Calling backend API for mandate flow...');
      
      const response = await fetch(`${this.apiBase}/api/create-subscription-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify({
          plan_id: this.selectedPlan.planId,
          customer_email: customerEmail,
          customer_phone: customerPhone || '',
          product_id: this.selectedPlan.variantId,
          frequency: this.selectedPlan.frequency.replace('months', ''),
          product_title: this.selectedPlan.name,
          product_description: this.selectedPlan.description,
          amount: Math.round(this.selectedPlan.price * 100) // Convert to paise
        })
      });

      console.log('📡 API response status:', response.status);
      console.log('📡 API response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API error response:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('📊 API response data:', result);

      if (result.success) {
        console.log('✅ Subscription created, opening Razorpay checkout...');
        // Open Razorpay checkout with order (shows correct amount)
        this.openRazorpayCheckout(result.order_id, result.subscription_id, result.key_id, result.amount);
      } else {
        console.error('❌ API error:', result.error);
        this.showNotification(`Failed to create subscription: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('❌ Subscription creation error:', error);
      this.showNotification(`Failed to create subscription: ${error.message}`, 'error');
    }
  }
  
  openRazorpayCheckout(orderId, subscriptionId, keyId, amount) {
    console.log('💳 Opening Razorpay checkout with:', {
      orderId,
      subscriptionId,
      keyId,
      amount,
      selectedPlan: this.selectedPlan
    });

    // Create a completely isolated Razorpay instance
    this.createIsolatedRazorpayCheckout(orderId, subscriptionId, keyId, amount);
  }
  
  createIsolatedRazorpayCheckout(orderId, subscriptionId, keyId, amount) {
    // Remove all existing Razorpay scripts and instances
    const existingScripts = document.querySelectorAll('script[src*="razorpay"]');
    existingScripts.forEach(script => script.remove());
    
    // Clear global Razorpay object
    window.Razorpay = undefined;
    
    // Load fresh Razorpay SDK with timestamp to prevent caching
    const timestamp = Date.now();
    const script = document.createElement('script');
    script.src = `https://checkout.razorpay.com/v1/razorpay.js?t=${timestamp}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    
    script.onload = () => {
      console.log('🔄 Fresh Razorpay SDK loaded');
      this.initializeCleanRazorpayCheckout(orderId, subscriptionId, keyId, amount);
    };
    
    script.onerror = () => {
      console.error('❌ Failed to load Razorpay SDK');
      this.showNotification('Failed to load payment gateway', 'error');
    };
    
    document.head.appendChild(script);
  }
  
  initializeCleanRazorpayCheckout(orderId, subscriptionId, keyId, amount) {
    // Wait a moment for Razorpay to fully initialize
    setTimeout(() => {
      if (typeof Razorpay === 'undefined') {
        console.error('❌ Razorpay not available after reload');
        this.showNotification('Payment gateway not available', 'error');
        return;
      }
      
      const options = {
        key: 'rzp_live_SSfTeiwakEqpU0', // Force use new key
        order_id: orderId,
        name: 'Luvwish Subscription',
        description: `${this.selectedPlan.name} - ${this.selectedPlan.description}`,
        image: 'https://luvwish.in/cdn/shop/files/Logo_1_250x250.png',
        amount: amount, // Amount in paise
        currency: 'INR',
        handler: (response) => {
          console.log('✅ Payment completed:', response);
          
          // Verify payment and activate subscription
          this.verifyPaymentAndActivateSubscription(response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature, subscriptionId);
        },
        modal: {
          ondismiss: () => {
            console.log('❌ Payment modal dismissed');
            this.showNotification('Payment cancelled', 'warning');
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

      console.log('🔧 Clean Razorpay options:', options);
      
      try {
        // Create new Razorpay instance with fresh options
        const rzp = new Razorpay(options);
        console.log('🚀 Opening clean Razorpay payment modal...');
        rzp.open();
      } catch (error) {
        console.error('❌ Error opening Razorpay:', error);
        this.showNotification('Failed to open payment gateway', 'error');
      }
    }, 500);
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
