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
    
    // Wait for Razorpay SDK to load
    setTimeout(() => {
      this.checkRazorpaySDK();
    }, 1000);
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
    const options = document.querySelectorAll('.subscription-option');
    
    options.forEach(option => {
      option.addEventListener('click', () => this.selectPlan(option));
    });
  }
  
  selectPlan(option) {
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
      name: option.querySelector('h4').textContent,
      description: option.querySelector('.text-gray-600').textContent
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: this.selectedPlan.planId,
          customer_email: customerEmail,
          customer_phone: customerPhone || '',
          product_id: this.selectedPlan.variantId,
          frequency: this.selectedPlan.frequency.replace('months', ''),
          product_title: this.selectedPlan.name,
          product_description: this.selectedPlan.description
        })
      });

      console.log('📡 API response status:', response.status);
      const result = await response.json();
      console.log('📊 API response data:', result);

      if (result.success) {
        console.log('✅ Subscription created, opening Razorpay subscription checkout...');
        // Open Razorpay subscription checkout (mandate flow)
        this.openRazorpaySubscriptionCheckout(result.subscription_id, result.key_id);
      } else {
        console.error('❌ API error:', result.error);
        this.showNotification(`Failed to create subscription: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('❌ Subscription creation error:', error);
      this.showNotification('Failed to create subscription', 'error');
    }
  }
  
  openRazorpaySubscriptionCheckout(subscriptionId, keyId) {
    console.log('💳 Opening Razorpay subscription checkout with:', {
      subscriptionId,
      keyId
    });

    const options = {
      key: keyId,
      subscription_id: subscriptionId,
      name: 'Luvwish Subscription',
      description: 'Complete your subscription setup',
      image: 'https://your-store.com/logo.png',
      handler: (response) => {
        console.log('✅ Subscription completed:', response);
        this.showNotification('Subscription activated successfully!', 'success');
        
        // Redirect to subscription management page after 2 seconds
        setTimeout(() => {
          window.location.href = '/pages/subscription-management';
        }, 2000);
      },
      modal: {
        ondismiss: () => {
          console.log('❌ Subscription modal dismissed');
          this.showNotification('Subscription setup cancelled', 'warning');
        },
        escape: true,
        backdropclose: false
      },
      notes: {
        subscription_type: 'mandate',
        flow: 'autopay'
      }
    };

    console.log('🔧 Razorpay options:', options);
    
    const rzp = new Razorpay(options);
    console.log('🚀 Opening Razorpay subscription modal...');
    rzp.open();
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
