// Subscription Product JavaScript
class SubscriptionProduct {
  constructor() {
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    this.razorpayKeyId = window.subscriptionConfig?.razorpayKeyId || 'rzp_live_SQfuiRsuG1eqca';
    this.customerId = window.subscriptionConfig?.customerId;
    
    this.selectedPlan = null;
    this.cart = [];
    
    this.init();
  }
  
  init() {
    this.initializeSubscriptionOptions();
    this.initializeButtons();
    this.loadRazorpayScript();
  }
  
  loadRazorpayScript() {
    if (!document.getElementById('razorpay-script')) {
      const script = document.createElement('script');
      script.id = 'razorpay-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }
  
  initializeSubscriptionOptions() {
    const options = document.querySelectorAll('.subscription-option');
    options.forEach(option => {
      option.addEventListener('click', () => this.selectSubscriptionOption(option));
    });
  }
  
  selectSubscriptionOption(option) {
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
    const addToCartBtn = document.getElementById('addToCartBtn');
    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (addToCartBtn) addToCartBtn.addEventListener('click', () => this.addToCart());
    if (subscribeNowBtn) subscribeNowBtn.addEventListener('click', () => this.subscribeNow());
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => this.checkout());
    
    // Enable buttons when customer info is filled
    const emailInput = document.getElementById('customerEmail');
    const phoneInput = document.getElementById('customerPhone');
    
    if (emailInput) emailInput.addEventListener('input', () => this.updateButtonStates());
    if (phoneInput) phoneInput.addEventListener('input', () => this.updateButtonStates());
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
