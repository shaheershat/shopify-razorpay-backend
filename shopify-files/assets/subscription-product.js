// Subscription Product JavaScript
console.log('🔥 subscription-product.js loaded!');

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
    
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => this.checkout());
    
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
    
    const addToCartBtn = document.getElementById('addToCartBtn');
    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    
    if (addToCartBtn) addToCartBtn.disabled = !hasValidInfo;
    if (subscribeNowBtn) subscribeNowBtn.disabled = !hasValidInfo;
  }
  
  addToCart() {
    if (!this.selectedPlan) return;
    
    const cartItem = {
      ...this.selectedPlan,
      email: document.getElementById('customerEmail').value,
      phone: document.getElementById('customerPhone').value,
      timestamp: new Date().toISOString()
    };
    
    this.cart.push(cartItem);
    this.updateCartSummary();
    this.showNotification('Added to cart successfully!', 'success');
  }
  
  updateCartSummary() {
    const cartSummary = document.getElementById('cartSummary');
    const cartItems = document.getElementById('cartItems');
    const totalAmount = document.getElementById('totalAmount');
    
    if (!cartSummary || !cartItems || !totalAmount) return;
    
    if (this.cart.length === 0) {
      cartSummary.classList.add('hidden');
      return;
    }
    
    cartSummary.classList.remove('hidden');
    
    // Clear and rebuild cart items
    cartItems.innerHTML = '';
    let total = 0;
    
    this.cart.forEach((item, index) => {
      total += item.price;
      const itemElement = document.createElement('div');
      itemElement.className = 'flex justify-between items-center py-2 border-b';
      itemElement.innerHTML = `
        <div>
          <h4 class="font-semibold">${item.name}</h4>
          <p class="text-sm text-gray-600">${item.email}</p>
        </div>
        <div class="text-right">
          <p class="font-bold">₹${item.price}</p>
          <button onclick="subscriptionProduct.removeFromCart(${index})" class="text-red-600 text-sm hover:underline">Remove</button>
        </div>
      `;
      cartItems.appendChild(itemElement);
    });
    
    totalAmount.textContent = `₹${total.toFixed(2)}`;
  }
  
  removeFromCart(index) {
    this.cart.splice(index, 1);
    this.updateCartSummary();
  }
  
  subscribeNow() {
    if (!this.selectedPlan) return;
    
    this.createOrder(this.selectedPlan);
  }
  
  checkout() {
    if (this.cart.length === 0) return;
    
    // Process each item in cart
    this.cart.forEach(item => {
      this.createOrder(item);
    });
    
    // Clear cart after processing
    this.cart = [];
    this.updateCartSummary();
  }
  
  async createOrder(subscriptionData) {
    try {
      this.showNotification('Creating payment order...', 'info');
      
      // Create Razorpay order
      const response = await fetch(`${this.apiBase}/api/create-razorpay-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: subscriptionData.price * 100, // Razorpay expects amount in paise
          currency: 'INR',
          receipt: `receipt_${Date.now()}`
        })
      });
      
      const orderData = await response.json();
      
      if (orderData.success) {
        this.openRazorpayCheckout(orderData.order, subscriptionData);
      } else {
        this.showNotification('Failed to create order: ' + orderData.error, 'error');
      }
    } catch (error) {
      this.showNotification('Error creating order: ' + error.message, 'error');
    }
  }
  
  async createSubscription() {
    try {
      console.log('🚀 Starting subscription creation...');
      this.showNotification('Creating subscription...', 'info');
      
      const selectedVariant = this.getSelectedVariant();
      console.log('📦 Selected variant:', selectedVariant);
      
      if (!selectedVariant) {
        console.error('❌ No variant selected');
        this.showNotification('Please select a subscription plan', 'error');
        return;
      }

      // Get subscription data from variant metafields
      const frequency = selectedVariant.metafields?.custom?.frequency;
      const razorpayPlanId = selectedVariant.metafields?.custom?.razorpay_plan_id;
      const description = selectedVariant.metafields?.custom?.description;

      console.log('🔍 Metafields data:', {
        frequency,
        razorpayPlanId,
        description
      });

      if (!frequency || !razorpayPlanId) {
        console.error('❌ Missing metafields');
        this.showNotification('Subscription plan not configured', 'error');
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

      // Create subscription via backend (bypass Shopify checkout)
      console.log('🌐 Calling backend API...');
      const response = await fetch(`${this.apiBase}/api/create-subscription-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: razorpayPlanId,
          customer_email: customerEmail,
          customer_phone: customerPhone || '',
          product_id: selectedVariant.id,
          frequency: frequency.replace('months', ''),
          product_title: selectedVariant.title,
          product_description: description || ''
        })
      });

      console.log('📡 API response status:', response.status);
      const result = await response.json();
      console.log('📊 API response data:', result);

      if (result.success) {
        console.log('✅ Subscription created, opening Razorpay checkout...');
        // Open Razorpay subscription checkout directly
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
    console.log('💳 Opening Razorpay checkout with:', {
      subscriptionId,
      keyId
    });

    const options = {
      key: keyId,
      subscription_id: subscriptionId,
      name: 'Luvwish',
      description: 'Monthly Subscription Plan',
      image: '/favicon.ico',
      handler: (response) => {
        console.log('✅ Razorpay success response:', response);
        this.handleSubscriptionSuccess(response);
      },
      modal: {
        ondismiss: () => {
          console.log('❌ Razorpay checkout dismissed');
          this.showNotification('Subscription setup cancelled', 'warning');
        },
        escape: true,
        backdropclose: false
      },
      theme: {
        color: '#2563eb'
      }
    };

    console.log('🔧 Razorpay options:', options);

    try {
      const rzp = new Razorpay(options);
      console.log('🚀 Opening Razorpay modal...');
      rzp.open();
    } catch (error) {
      console.error('❌ Razorpay error:', error);
      this.showNotification('Failed to open payment gateway', 'error');
    }
  }

  handleSubscriptionSuccess(response) {
    this.showNotification('Subscription created successfully!', 'success');
    
    // Redirect to subscription management page
    setTimeout(() => {
      window.location.href = '/pages/subscription-management';
    }, 2000);
  }
  
  openRazorpayCheckout(order, subscriptionData) {
    const options = {
      key: this.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Luvwish',
      description: subscriptionData.name,
      order_id: order.id,
      handler: (response) => this.handlePaymentSuccess(response, subscriptionData),
      modal: {
        ondismiss: () => this.showNotification('Payment cancelled', 'warning')
      },
      prefill: {
        email: subscriptionData.email,
        contact: subscriptionData.phone
      }
    };
    
    const rzp = new Razorpay(options);
    rzp.open();
  }
  
  async handlePaymentSuccess(paymentResponse, subscriptionData) {
    try {
      this.showNotification('Creating subscription...', 'info');
      
      const response = await fetch(`${this.apiBase}/api/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payment_id: paymentResponse.razorpay_payment_id,
          plan_id: subscriptionData.planId,
          customer_email: subscriptionData.email,
          customer_phone: subscriptionData.phone,
          product_id: subscriptionData.variantId,
          frequency: subscriptionData.frequency
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification('Subscription created successfully!', 'success');
        // Redirect to subscription management page
        setTimeout(() => {
          window.location.href = '/pages/subscription-management';
        }, 2000);
      } else {
        this.showNotification('Failed to create subscription: ' + result.error, 'error');
      }
    } catch (error) {
      this.showNotification('Error creating subscription: ' + error.message, 'error');
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
