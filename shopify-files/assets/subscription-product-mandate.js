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
    
    // Update button states (no input fields to monitor)
    this.updateButtonStates();
    
    console.log('🔥 Buttons initialized!');
  }
  
  updateButtonStates() {
    // Only require plan selection (customer info is auto-filled from logged-in user)
    const hasValidInfo = this.selectedPlan;
    
    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    
    if (subscribeNowBtn) subscribeNowBtn.disabled = !hasValidInfo;
  }
  
  async createSubscription() {
    try {
      if (!this.selectedPlan) {
        this.showNotification('Please select a subscription plan', 'error');
        return;
      }

      // Use logged-in customer info automatically (no input fields needed)
      const customerEmail = this.customerEmail || '{{ customer.email }}';
      const customerPhone = this.customerPhone || '{{ customer.phone }}';

      if (!customerEmail) {
        this.showNotification('Please log in to subscribe', 'error');
        return;
      }

      console.log('🚀 Starting subscription flow with:', {
        planId: this.selectedPlan.planId,
        customerEmail,
        customerPhone,
        amount: this.selectedPlan.price // Use price from selected plan (in rupees)
      });

      // Show loading
      this.showNotification('Opening payment authorization...', 'info');
      
      // Step 1: Directly open Razorpay checkout with plan details (NO subscription creation yet)
      // Create subscription only AFTER payment authorization
      this.openRazorpaySubscriptionCheckout(this.selectedPlan.planId, this.selectedPlan.price, {
        customerEmail,
        customerPhone,
        variantId: this.selectedPlan.variantId,
        frequency: this.selectedPlan.frequency,
        productTitle: this.selectedPlan.name,
        productDescription: this.selectedPlan.description
      });

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
  
  openRazorpaySubscriptionCheckout(planId, amount, customerData) {
    console.log('🚀 Opening Razorpay subscription checkout (mandate flow)...');
    console.log('💰 Using amount from plan:', amount);
    console.log('👤 Customer data:', customerData);
    
    // Check if Razorpay is available
    if (typeof Razorpay === 'undefined') {
      console.error('❌ Razorpay not available');
      this.showNotification('Payment gateway not available', 'error');
      return;
    }
    
    // PURE SUBSCRIPTION MANDATE CHECKOUT - bypasses Magic Checkout completely
    const options = {
      key: 'rzp_live_SSfTeiwakEqpU0', // Force use new key
      subscription_id: planId, // Use subscription_id for mandate flow
      name: 'Luvwish Subscription',
      description: `${customerData.productTitle} - ${customerData.productDescription}`,
      image: 'https://luvwish.in/cdn/shop/files/Logo_1_250x250.png',
      amount: amount * 100, // Convert rupees to paise
      handler: async (response) => {
        console.log('✅ Subscription mandate completed:', response);
        
        // For subscription mandate flow, we get razorpay_subscription_id and razorpay_payment_id
        if (response.razorpay_subscription_id && response.razorpay_payment_id) {
          console.log('🎉 Subscription mandate authorized successfully!');
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
        plan_name: customerData.productTitle,
        plan_price: amount,
        variant_id: customerData.variantId,
        plan_id: planId,
        customer_email: customerData.customerEmail,
        customer_phone: customerData.customerPhone,
        timestamp: Date.now()
      },
      theme: {
        color: '#3399cc',
        backdrop_color: '#ffffff'
      },
      prefill: {
        email: customerData.customerEmail || '',
        contact: customerData.customerPhone || ''
      },
      readonly: {
        email: false,
        contact: false
      }
    };

    console.log('🔧 Razorpay SUBSCRIPTION MANDATE options:', options);
    console.log('🔍 Using subscription_id:', planId);
    console.log('💰 Amount:', amount * 100, '(paise)');
    console.log('🚀 Opening SUBSCRIPTION MANDATE modal - NO Magic Checkout!');
    
    try {
      // Use the existing Razorpay instance directly (no need to reload)
      const rzp = new Razorpay(options);
      console.log('✅ Razorpay subscription mandate instance created successfully');
      console.log('🚀 Opening SUBSCRIPTION MANDATE modal...');
      
      // Open subscription mandate modal (this will show autopay setup)
      rzp.open();
      
      // Check if modal opened
      setTimeout(() => {
        const modal = document.querySelector('.razorpay-container');
        if (modal) {
          console.log('✅ Razorpay subscription mandate modal opened successfully');
          console.log('🎯 This is PURE MANDATE flow - autopay setup only');
        } else {
          console.warn('⚠️ Razorpay modal not found, trying to open again...');
          // Try once more
          rzp.open();
        }
      }, 500);
      
    } catch (error) {
      console.error('❌ Error opening Razorpay subscription mandate:', error);
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
