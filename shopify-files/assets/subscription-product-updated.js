// Subscription Product JavaScript
console.log('🔥 subscription-product-updated.js loaded!');

class SubscriptionProductUpdated {
  constructor() {
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    this.razorpayKeyId = window.subscriptionConfig?.razorpay_key_id || 'rzp_live_SSfTeiwakEqpU0';
    this.customerEmail = window.subscriptionConfig?.customerEmail;
    this.customerPhone = window.subscriptionConfig?.customerPhone;
    this.selectedPlan = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.initPurchaseToggle();
    this.initButtons();
  }

  initPurchaseToggle() {
    document.querySelectorAll('input[name="purchase_type"]').forEach(radio => {
      radio.addEventListener('change', () => this.handlePurchaseTypeChange(radio.value));
    });
    const checked = document.querySelector('input[name="purchase_type"]:checked');
    if (checked) this.handlePurchaseTypeChange(checked.value);
  }

  handlePurchaseTypeChange(type) {
    const oneTime = document.getElementById('one-time-section');
    const subSection = document.getElementById('subscription-section');
    const oneTimeBtn = document.getElementById('one-time-button');
    const subBtn = document.getElementById('subscription-button');

    if (type === 'subscription') {
      if (oneTime) oneTime.style.display = 'none';
      if (subSection) subSection.style.display = 'block';
      if (oneTimeBtn) oneTimeBtn.style.display = 'none';
      if (subBtn) subBtn.style.display = 'block';
    } else {
      if (oneTime) oneTime.style.display = 'block';
      if (subSection) subSection.style.display = 'none';
      if (oneTimeBtn) oneTimeBtn.style.display = 'block';
      if (subBtn) subBtn.style.display = 'none';
    }
  }

  initButtons() {
    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.openModal());
    }

    const subscribeNowBtn = document.getElementById('subscribeNowBtn');
    if (subscribeNowBtn) {
      subscribeNowBtn.addEventListener('click', () => this.createSubscription());
    }

    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => this.closeModal());
    }

    const modalOverlay = document.getElementById('subscriptionModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeModal();
      });
    }

    ['customerEmail','customerPhone','firstName','lastName','addressLine1','city','state','postalCode'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.updateButtonStates());
    });
  }

  // Read the currently selected plan from the dropdown
  getSelectedPlan() {
    const selected = document.querySelector('.subscription-option.selected');
    if (!selected) return null;
    return {
      variantId: selected.dataset.variantId,
      planId: selected.dataset.planId,
      frequency: selected.dataset.plan,
      price: parseInt(selected.dataset.price) / 100,
      name: selected.dataset.description || 'Subscription',
      badge: selected.dataset.badge || ''
    };
  }

  // Read selected box tier
  getSelectedBoxTier() {
    const tierCard = document.querySelector('.cbox__tier.cbox--selected');
    if (!tierCard) return null;
    return {
      tier: tierCard.dataset.tier,
      variantId: tierCard.dataset.variant,
      boxes: tierCard.dataset.boxes || '1',
      label: tierCard.querySelector('div[style*="font-size:14px"]')?.textContent?.trim() || `Box ${tierCard.dataset.tier}`
    };
  }

  // Read pad quantities from the customize box widget
  getPadSelection() {
    const wrap = document.querySelector('[id^="customize-box-"]');
    if (!wrap) return 'Standard configuration';
    const sid = wrap.id.replace('customize-box-', '');
    const pad1 = document.getElementById(`cbox-qty-${sid}-1`)?.textContent?.trim() || '0';
    const pad2 = document.getElementById(`cbox-qty-${sid}-2`)?.textContent?.trim() || '0';
    const pad3 = document.getElementById(`cbox-qty-${sid}-3`)?.textContent?.trim() || '0';
    const label1 = wrap.dataset.pad1 || 'XXL';
    const label2 = wrap.dataset.pad2 || 'XL';
    const label3 = wrap.dataset.pad3 || 'L';
    const parts = [];
    if (parseInt(pad1) > 0) parts.push(`${label1}: ${pad1}`);
    if (parseInt(pad2) > 0) parts.push(`${label2}: ${pad2}`);
    if (parseInt(pad3) > 0) parts.push(`${label3}: ${pad3}`);
    return parts.length > 0 ? parts.join(', ') : 'Standard configuration';
  }

  openModal() {
    const plan = this.getSelectedPlan();
    if (!plan) {
      this.showNotification('Please select a subscription plan', 'error');
      return;
    }
    const modal = document.getElementById('subscriptionModal');
    if (modal) modal.classList.add('active');
    this.updateButtonStates();
  }

  closeModal() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) modal.classList.remove('active');
  }

  updateButtonStates() {
    const plan = this.getSelectedPlan();
    const email = document.getElementById('customerEmail')?.value || '';
    const phone = document.getElementById('customerPhone')?.value || '';
    const firstName = document.getElementById('firstName')?.value || '';
    const lastName = document.getElementById('lastName')?.value || '';
    const address = document.getElementById('addressLine1')?.value || '';
    const city = document.getElementById('city')?.value || '';
    const state = document.getElementById('state')?.value || '';
    const postalCode = document.getElementById('postalCode')?.value || '';

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneValid = phone.replace(/\D/g, '').length >= 10;
    const postalValid = postalCode.replace(/\D/g, '').length >= 6;

    const valid = emailValid && phoneValid && firstName && lastName && address && city && state && postalValid && plan;

    const btn = document.getElementById('subscribeNowBtn');
    if (btn) {
      btn.disabled = !valid;
      btn.style.opacity = valid ? '1' : '0.5';
      btn.style.cursor = valid ? 'pointer' : 'not-allowed';
    }
  }

  async createSubscription() {
    const plan = this.getSelectedPlan();
    if (!plan) {
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

    if (!customerEmail || !customerPhone || !firstName || !lastName || !addressLine1 || !city || !state || !postalCode) {
      this.showNotification('Please fill in all required fields', 'error');
      return;
    }

    const boxTier = this.getSelectedBoxTier();
    const padSelection = this.getPadSelection();
    const boxLabel = boxTier ? `${boxTier.label} (Tier ${boxTier.tier})` : 'Not selected';

    console.log('🚀 Creating subscription:', { plan, boxTier, padSelection });
    this.showNotification('Creating subscription...', 'info');

    try {
      const response = await fetch(`${this.apiBase}/api/create-subscription-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan.planId,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          product_id: plan.variantId,
          frequency: plan.frequency,
          product_title: `${boxLabel} - ${plan.name}`,
          product_description: `${boxLabel} subscription with ${padSelection}`,
          amount: plan.price * 100, // Convert to paise
          // ENHANCED: Box and items selection
          boxes: boxLabel,
          items: padSelection,
          // Address fields
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

      const result = await response.json();
      console.log('Subscription creation result:', result);

      if (result.success) {
        // Open Razorpay checkout for payment
        this.openRazorpayCheckout(result.subscription, result.customer, plan);
      } else {
        this.showNotification(result.error || 'Failed to create subscription', 'error');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      this.showNotification('Failed to create subscription', 'error');
    }
  }

  openRazorpayCheckout(subscription, customer, plan) {
    console.log('🔓 Opening Razorpay checkout for subscription:', subscription);
    
    const options = {
      key: this.razorpayKeyId,
      subscription_id: subscription.id,
      name: `${plan.name} - ${plan.frequency}`,
      description: `Subscription for ${plan.frequency}`,
      image: 'https://luvwish.in/cdn/shop/files/Logo_1_250x250.png',
      handler: (response) => {
        console.log('✅ Payment successful:', response);
        this.showNotification('Payment successful! Subscription activated.', 'success');
        this.closeModal();
        // Redirect to success page or show confirmation
        setTimeout(() => {
          window.location.href = '/pages/subscription-success';
        }, 2000);
      },
      modal: {
        ondismiss: () => {
          console.log('❌ Payment cancelled by user');
          this.showNotification('Payment cancelled. Subscription was not activated.', 'warning');
          // Note: The subscription remains in "created" state but won't be charged
        }
      },
      notes: subscription.notes,
      theme: {
        color: '#E93F7F'
      },
      prefill: {
        email: customer.email,
        contact: customer.phone
      }
    };

    const razorpay = new Razorpay(options);
    razorpay.open();
  }

  showNotification(message, type = 'info') {
    document.querySelectorAll('.rzp-notification').forEach(n => n.remove());
    const n = document.createElement('div');
    n.className = 'rzp-notification';
    n.textContent = message;
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    n.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;color:white;font-weight:500;z-index:9999;background:${colors[type] || colors.info};`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.subscriptionProductUpdated = new SubscriptionProductUpdated();
  });
} else {
  window.subscriptionProductUpdated = new SubscriptionProductUpdated();
}
