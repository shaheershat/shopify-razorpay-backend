// Subscription Product JavaScript - Updated for Current HTML Structure
console.log('🔥 subscription-product-updated.js loaded!');

class SubscriptionProductUpdated {
  constructor() {
    console.log('🔥 SubscriptionProductUpdated constructor called!');
    
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
    this.selectedBoxTier = null;
    this.padConfiguration = {};
    
    // Test backend connection first
    this.testBackendConnection();
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
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
  
  init() {
    console.log('🔥 Initializing SubscriptionProductUpdated...');
    
    // Wait for Razorpay SDK to load
    this.checkRazorpaySDK();
    
    // Initialize UI components
    this.initializePurchaseToggle();
    this.initializeBoxSelection();
    this.initializeSubscriptionOptions();
    this.initializeButtons();
    this.initializeModal();
    
    console.log('🔥 SubscriptionProductUpdated initialized!');
  }
  
  checkRazorpaySDK() {
    console.log('🔥 Checking Razorpay SDK...');
    
    if (typeof Razorpay === 'undefined') {
      console.error('❌ Razorpay SDK not loaded');
      // Load Razorpay SDK
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
      script.onload = () => {
        console.log('✅ Razorpay SDK loaded dynamically');
        this.updateButtonStates();
      };
      document.head.appendChild(script);
    } else {
      console.log('✅ Razorpay SDK already loaded');
      this.updateButtonStates();
    }
  }
  
  initializePurchaseToggle() {
    console.log('🔥 Initializing purchase type toggle...');
    
    const toggleOptions = document.querySelectorAll('input[name="purchase_type"]');
    toggleOptions.forEach(option => {
      option.addEventListener('change', () => {
        this.handlePurchaseTypeChange(option.value);
      });
    });
    
    // Set initial state
    const selectedOption = document.querySelector('input[name="purchase_type"]:checked');
    if (selectedOption) {
      this.handlePurchaseTypeChange(selectedOption.value);
    }
  }
  
  handlePurchaseTypeChange(type) {
    console.log('🔥 Purchase type changed to:', type);
    
    const oneTimeSection = document.getElementById('one-time-section');
    const subscriptionSection = document.getElementById('subscription-section');
    const oneTimeButton = document.getElementById('one-time-button');
    const subscriptionButton = document.getElementById('subscription-button');
    
    if (type === 'subscription') {
      // Show subscription section
      if (oneTimeSection) oneTimeSection.style.display = 'none';
      if (subscriptionSection) subscriptionSection.style.display = 'block';
      if (oneTimeButton) oneTimeButton.style.display = 'none';
      if (subscriptionButton) subscriptionButton.style.display = 'block';
      
      // Load subscription plans
      this.loadSubscriptionPlans();
    } else {
      // Show one-time section
      if (oneTimeSection) oneTimeSection.style.display = 'block';
      if (subscriptionSection) subscriptionSection.style.display = 'none';
      if (oneTimeButton) oneTimeButton.style.display = 'block';
      if (subscriptionButton) subscriptionButton.style.display = 'none';
    }
  }
  
  initializeBoxSelection() {
    console.log('🔥 Initializing box selection...');
    
    const boxCards = document.querySelectorAll('.box-card');
    boxCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectBoxTier(card);
      });
    });
  }
  
  selectBoxTier(card) {
    console.log('🔥 Box tier selected:', card);
    
    // Remove previous selection
    document.querySelectorAll('.box-card').forEach(c => {
      c.classList.remove('selected');
    });
    
    // Add selection to clicked card
    card.classList.add('selected');
    
    // Store selected box tier data
    this.selectedBoxTier = {
      label: card.querySelector('.tier-label')?.textContent || '',
      sublabel: card.querySelector('.tier-sublabel')?.textContent || '',
      boxes: parseInt(card.dataset.boxes) || 1,
      variantId: card.dataset.variantId || '',
      price: parseFloat(card.dataset.price) || 0
    };
    
    console.log('🔥 Selected box tier:', this.selectedBoxTier);
    
    // Load subscription plans for this box tier
    this.loadSubscriptionPlans();
  }
  
  async loadSubscriptionPlans() {
    console.log('🔥 Loading subscription plans...');
    
    const dynamicOptions = document.getElementById('dynamicSubscriptionOptions');
    if (!dynamicOptions) {
      console.error('❌ dynamicSubscriptionOptions element not found');
      return;
    }
    
    // Show loading
    dynamicOptions.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Loading subscription plans...</p>';
    
    try {
      // Simulate loading plans (replace with actual API call if needed)
      const plans = [
        {
          id: 'plan_SSfug4F5nvQEi5',
          name: '3 Months Plan',
          description: 'Billed every 3 months',
          frequency: '3',
          price: 29900, // in paise
          variantId: this.selectedBoxTier?.variantId || '46513506189501'
        },
        {
          id: 'plan_SSfug4F5nvQEi6',
          name: '6 Months Plan',
          description: 'Billed every 6 months',
          frequency: '6',
          price: 59900, // in paise
          variantId: this.selectedBoxTier?.variantId || '46513506189501'
        }
      ];
      
      // Render plans
      let plansHTML = '';
      plans.forEach(plan => {
        plansHTML += `
          <div class="subscription-option" data-variant-id="${plan.variantId}" data-plan-id="${plan.id}" data-plan="${plan.frequency}" data-price="${plan.price}">
            <div class="flex justify-between items-start">
              <div>
                <h4 class="plan-title">${plan.name}</h4>
                <p class="plan-description">${plan.description}</p>
              </div>
              <div class="text-right">
                <div class="plan-price">₹${(plan.price / 100).toFixed(2)}</div>
                <div class="plan-frequency">Every ${plan.frequency} months</div>
              </div>
            </div>
          </div>
        `;
      });
      
      dynamicOptions.innerHTML = plansHTML;
      
      // Add click listeners to new plan options
      this.initializeSubscriptionOptions();
      
    } catch (error) {
      console.error('❌ Failed to load subscription plans:', error);
      dynamicOptions.innerHTML = '<p style="text-align: center; color: #dc2626; padding: 20px;">Failed to load plans. Please try again.</p>';
    }
  }
  
  initializeSubscriptionOptions() {
    console.log('🔥 Initializing subscription options...');
    
    const options = document.querySelectorAll('.subscription-option');
    console.log('🔥 Found subscription options:', options.length);
    
    options.forEach((option, index) => {
      // Remove existing listeners to avoid duplicates
      option.replaceWith(option.cloneNode(true));
    });
    
    // Re-select after cloning
    const freshOptions = document.querySelectorAll('.subscription-option');
    freshOptions.forEach((option, index) => {
      console.log(`🔥 Adding click listener to option ${index}:`, option);
      option.addEventListener('click', () => {
        console.log(`🔥 Option ${index} clicked!`);
        this.selectPlan(option);
      });
    });
    
    if (freshOptions.length === 0) {
      console.error('❌ No subscription options found!');
    }
  }
  
  selectPlan(option) {
    console.log('🔥 selectPlan called with:', option);
    
    // Remove previous selection
    document.querySelectorAll('.subscription-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    
    // Add selection to clicked option
    option.classList.add('selected');
    
    // Store selected plan data
    this.selectedPlan = {
      variantId: option.dataset.variantId,
      planId: option.dataset.planId,
      frequency: option.dataset.plan,
      price: parseFloat(option.dataset.price) / 100, // Convert from paise to rupees
      name: option.querySelector('.plan-title')?.textContent || 'Unknown Plan',
      description: option.querySelector('.plan-description')?.textContent || ''
    };
    
    console.log('🔥 Selected plan:', this.selectedPlan);
    this.updateButtonStates();
  }
  
  initializeButtons() {
    console.log('🔥 Initializing buttons...');
    
    // Continue button
    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        console.log('🔥 Continue button clicked!');
        this.openModal();
      });
    }
    
    // Subscribe button in modal
    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    if (subscribeNowBtn) {
      subscribeNowBtn.addEventListener('click', () => {
        console.log('🔥 Subscribe Now button clicked!');
        this.createSubscription();
      });
    }
    
    // Modal close button
    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        this.closeModal();
      });
    }
    
    // Close modal when clicking outside
    const modalOverlay = document.getElementById('subscriptionModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          this.closeModal();
        }
      });
    }
    
    // Form input listeners for validation
    this.initializeFormValidation();
    
    console.log('🔥 Buttons initialized!');
  }
  
  initializeFormValidation() {
    const inputs = [
      'customerEmail', 'customerPhone', 'firstName', 'lastName',
      'addressLine1', 'city', 'state', 'postalCode'
    ];
    
    inputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener('input', () => this.updateButtonStates());
      }
    });
  }
  
  initializeModal() {
    console.log('🔥 Initializing modal...');
    // Modal is initially hidden, will be shown when needed
  }
  
  openModal() {
    console.log('🔥 Opening subscription modal...');
    
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
      modal.classList.add('active');
      console.log('✅ Modal opened');
    } else {
      console.error('❌ Modal not found');
    }
  }
  
  closeModal() {
    console.log('🔥 Closing subscription modal...');
    
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
      modal.classList.remove('active');
      console.log('✅ Modal closed');
    }
  }
  
  updateButtonStates() {
    const email = document.getElementById('customerEmail')?.value || '';
    const phone = document.getElementById('customerPhone')?.value || '';
    const firstName = document.getElementById('firstName')?.value || '';
    const lastName = document.getElementById('lastName')?.value || '';
    const addressLine1 = document.getElementById('addressLine1')?.value || '';
    const city = document.getElementById('city')?.value || '';
    const state = document.getElementById('state')?.value || '';
    const postalCode = document.getElementById('postalCode')?.value || '';
    
    // Validate email
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    // Validate phone (basic validation)
    const phoneValid = phone.length >= 10;
    
    // Validate postal code (basic validation)
    const postalCodeValid = postalCode.length >= 6;
    
    // Require all fields for subscription
    const hasValidInfo = emailValid && phoneValid && firstName && lastName && 
                        addressLine1 && city && state && postalCodeValid && 
                        this.selectedPlan;
    
    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    
    if (subscribeNowBtn) {
      subscribeNowBtn.disabled = !hasValidInfo;
      subscribeNowBtn.style.opacity = hasValidInfo ? '1' : '0.5';
      subscribeNowBtn.style.cursor = hasValidInfo ? 'pointer' : 'not-allowed';
    }
    
    console.log('🔍 Button state update:', {
      email: emailValid,
      phone: phoneValid,
      firstName: !!firstName,
      lastName: !!lastName,
      addressLine1: !!addressLine1,
      city: !!city,
      state: !!state,
      postalCode: postalCodeValid,
      selectedPlan: !!this.selectedPlan,
      hasValidInfo
    });
  }
  
  async createSubscription() {
    try {
      if (!this.selectedPlan) {
        this.showNotification('Please select a subscription plan', 'error');
        return;
      }

      const customerEmail = this.customerEmail || document.getElementById('customerEmail')?.value;
      const customerPhone = this.customerPhone || document.getElementById('customerPhone')?.value;
      const firstName = document.getElementById('firstName')?.value;
      const lastName = document.getElementById('lastName')?.value;
      const addressLine1 = document.getElementById('addressLine1')?.value;
      const addressLine2 = document.getElementById('addressLine2')?.value || '';
      const city = document.getElementById('city')?.value;
      const state = document.getElementById('state')?.value;
      const postalCode = document.getElementById('postalCode')?.value;

      // Validate inputs
      if (!customerEmail || !customerPhone || !firstName || !lastName || !addressLine1 || !city || !state || !postalCode) {
        this.showNotification('Please fill in all required fields', 'error');
        return;
      }

      console.log('🚀 Starting subscription flow with:', {
        planId: this.selectedPlan.planId,
        customerEmail,
        customerPhone,
        firstName,
        lastName,
        addressLine1,
        city,
        state,
        postalCode,
        amount: this.selectedPlan.price
      });

      // Show loading
      this.showNotification('Creating subscription...', 'info');
      
      // Get box and items selection from cart
      const boxesSelection = this.selectedBoxTier?.label || 'One Box';
      const itemsSelection = this.getItemsSelection();
      
      console.log('📦 Cart selection:', {
        boxes: boxesSelection,
        items: itemsSelection
      });

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
          amount: this.selectedPlan.price,
          // ENHANCED: Send box and items selection
          boxes: boxesSelection,
          items: itemsSelection,
          // Send address data
          customer_name: `${firstName} ${lastName}`,
          first_name: firstName,
          last_name: lastName,
          address: addressLine1,
          address_line_2: addressLine2,
          city: city,
          state: state,
          postal_code: postalCode,
          country: 'IN'
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
        console.log('✅ Subscription created, opening Razorpay checkout...');
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
  
  getItemsSelection() {
    // Get items from the pad configuration
    const pad1Qty = document.getElementById('pad1-qty')?.value || 0;
    const pad2Qty = document.getElementById('pad2-qty')?.value || 0;
    const pad3Qty = document.getElementById('pad3-qty')?.value || 0;
    
    const items = [];
    if (pad1Qty > 0) items.push(`${pad1Qty} XXL pads`);
    if (pad2Qty > 0) items.push(`${pad2Qty} XL pads`);
    if (pad3Qty > 0) items.push(`${pad3Qty} L pads`);
    
    return items.length > 0 ? items.join(', ') : 'Standard configuration';
  }
  
  openRazorpaySubscriptionCheckout(subscriptionId, keyId, amount) {
    console.log('🚀 Opening Razorpay subscription checkout (mandate flow)...');
    console.log('💰 Amount:', amount);
    
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
          
          // Close modal
          this.closeModal();
          
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
        product_id: this.selectedPlan.variantId,
        customer_email: this.customerEmail || document.getElementById('customerEmail')?.value,
        customer_phone: this.customerPhone || document.getElementById('customerPhone')?.value,
        boxes: this.selectedBoxTier?.label || 'One Box',
        items: this.getItemsSelection(),
        timestamp: Date.now()
      },
      theme: {
        color: '#3399cc',
        backdrop_color: '#ffffff'
      },
      prefill: {
        email: this.customerEmail || document.getElementById('customerEmail')?.value || '',
        contact: this.customerPhone || document.getElementById('customerPhone')?.value || ''
      },
      readonly: {
        email: false,
        contact: false
      }
    };

    console.log('🔧 Razorpay SUBSCRIPTION options:', options);
    console.log('🚀 Opening SUBSCRIPTION checkout (mandate flow)');
    
    try {
      // Create new Razorpay instance for SUBSCRIPTION
      const rzp = new Razorpay(options);
      console.log('✅ Razorpay subscription instance created successfully');
      
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
  
  showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 9999;
      transition: all 0.3s ease;
      ${type === 'success' ? 'background-color: #10b981;' : ''}
      ${type === 'error' ? 'background-color: #ef4444;' : ''}
      ${type === 'warning' ? 'background-color: #f59e0b;' : ''}
      ${type === 'info' ? 'background-color: #3b82f6;' : ''}
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.subscriptionProductUpdated = new SubscriptionProductUpdated();
  });
} else {
  window.subscriptionProductUpdated = new SubscriptionProductUpdated();
}
