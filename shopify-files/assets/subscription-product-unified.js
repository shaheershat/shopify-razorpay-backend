class SubscriptionProduct {
  constructor() {
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    this.customerId = window.subscriptionConfig?.customerId;
    this.customerEmail = window.subscriptionConfig?.customerEmail;
    this.customerPhone = window.subscriptionConfig?.customerPhone;
    
    this.selectedPlan = null;
    this.currentAction = null;
    this.currentSubscriptionId = null;
    
    this.init();
  }
  
  init() {
    console.log('🔥 Initializing Subscription Product...');
    
    // Check if Razorpay is available
    if (typeof Razorpay === 'undefined') {
      console.error('❌ Razorpay not available');
      this.showNotification('Payment gateway not available', 'error');
      return;
    }
    
    // Initialize subscription options
    this.initializeSubscriptionOptions();
    
    // Initialize buttons
    this.initializeButtons();
    
    console.log('✅ Subscription Product initialized successfully');
  }
  
  initializeSubscriptionOptions() {
    console.log('🔥 Initializing subscription options...');
    
    const options = document.querySelectorAll('.subscription-option');
    console.log('🔥 Found subscription options:', options.length);
    
    options.forEach(option => {
      option.addEventListener('click', () => this.selectPlan(option));
    });
    
    // Auto-select first plan if available
    if (options.length > 0) {
      this.selectPlan(options[0]);
    }
    
    console.log('✅ Subscription options initialized');
  }
  
  selectPlan(option) {
    console.log('🔥 Selecting plan:', option);
    
    // Remove selected class from all options
    document.querySelectorAll('.subscription-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    
    // Add selected class to clicked option
    option.classList.add('selected');
    
    // Store selected plan data
    this.selectedPlan = {
      planId: option.dataset.planId,
      variantId: option.dataset.variantId,
      frequency: option.dataset.plan,
      price: parseFloat(option.dataset.price) / 100, // Convert cents to rupees
      name: option.querySelector('h4').textContent,
      description: option.querySelector('p').textContent
    };
    
    console.log('✅ Plan selected:', this.selectedPlan);
    
    // Update button states
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payment_id: paymentId,
          order_id: orderId,
          signature: signature,
          subscription_id: subscriptionId,
          customer_id: this.customerId,
          customer_email: this.customerEmail,
          customer_phone: this.customerPhone,
          plan_id: this.selectedPlan.planId,
          variant_id: this.selectedPlan.variantId,
          frequency: this.selectedPlan.frequency,
          amount: this.selectedPlan.price
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Payment verified and subscription activated successfully!');
        this.showNotification('Subscription activated successfully!', 'success');
        
        // Redirect to subscription management page after 2 seconds
        setTimeout(() => {
          window.location.href = '/pages/subscription-management';
        }, 2000);
      } else {
        console.error('❌ Payment verification failed:', result.error);
        this.showNotification(`Payment verification failed: ${result.error}`, 'error');
      }
      
    } catch (error) {
      console.error('❌ Error verifying payment:', error);
      this.showNotification(`Payment verification failed: ${error.message}`, 'error');
    }
  }
  
  showNotification(message, type = 'info') {
    console.log(`🔔 Notification (${type}): ${message}`);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `subscription-notification subscription-notification--${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 500;
      z-index: 9999;
      max-width: 300px;
      word-wrap: break-word;
      animation: slideIn 0.3s ease;
    `;
    
    // Set color based on type
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#10b981';
        notification.style.color = 'white';
        break;
      case 'error':
        notification.style.backgroundColor = '#ef4444';
        notification.style.color = 'white';
        break;
      case 'warning':
        notification.style.backgroundColor = '#f59e0b';
        notification.style.color = 'white';
        break;
      default:
        notification.style.backgroundColor = '#3b82f6';
        notification.style.color = 'white';
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }
  
  getPlanDetails(planId) {
    console.log('🔍 Getting plan details for:', planId);
    
    // This would typically fetch from your backend
    // For now, return the selected plan details
    if (this.selectedPlan && this.selectedPlan.planId === planId) {
      return Promise.resolve(this.selectedPlan);
    }
    
    return Promise.reject(new Error('Plan not found'));
  }
  
  reset() {
    console.log('🔄 Resetting subscription product...');
    
    this.selectedPlan = null;
    this.currentAction = null;
    this.currentSubscriptionId = null;
    
    // Clear selected plan
    document.querySelectorAll('.subscription-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    
    // Reset button states
    this.updateButtonStates();
    
    console.log('✅ Subscription product reset complete');
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  if (typeof SubscriptionProduct !== 'undefined') {
    window.subscriptionProduct = new SubscriptionProduct();
  }
});

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .subscription-notification {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
`;
document.head.appendChild(style);
