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

    // Store for passing to order creation after payment
    const customerData = {
      customer_name: `${firstName} ${lastName}`,
      first_name: firstName,
      last_name: lastName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      address: addressLine1,
      address_line_2: addressLine2,
      city,
      state,
      postal_code: postalCode,
      country: 'IN'
    };

    console.log('🚀 Creating subscription:', { plan, boxTier, padSelection });
    this.showNotification('Creating subscription...', 'info');

    try {
      const response = await fetch(`${this.apiBase}/api/create-subscription-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan.planId,
          product_id: plan.variantId,
          frequency: plan.frequency,
          product_title: plan.name,
          amount: plan.price,
          boxes: boxLabel,
          items: padSelection,
          ...customerData
        })
      });

      const result = await response.json();

      if (result.success) {
        if (result.mock) {
          this.showNotification('Mock subscription created! (Test mode)', 'success');
          this.closeModal();
        } else {
          this.openRazorpayCheckout(result.subscription_id, result.key_id, result.amount, plan, boxLabel, padSelection, customerData);
        }
      } else {
        this.showNotification(`Failed: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('❌ Subscription error:', error);
      this.showNotification(`Error: ${error.message}`, 'error');
    }
  }

  openRazorpayCheckout(subscriptionId, keyId, amount, plan, boxLabel, padSelection, customerData) {
    if (typeof Razorpay === 'undefined') {
      this.showNotification('Payment gateway not available', 'error');
      return;
    }

    const options = {
      key: keyId,
      subscription_id: subscriptionId,
      name: 'Luvwish Subscription',
      description: `${plan.name} - Every ${plan.frequency} month(s)`,
      image: 'https://luvwish.in/cdn/shop/files/Logo_1_250x250.png',
      amount: amount,
      handler: async (response) => {
        if (response.razorpay_subscription_id && response.razorpay_payment_id) {
          this.showNotification('Payment done! Creating your order...', 'info');
          this.closeModal();
          try {
            const orderRes = await fetch(`${this.apiBase}/api/order-from-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
                ...customerData,
                boxes: boxLabel,
                items: padSelection,
                product_title: plan.name,
                frequency: plan.frequency,
                variant_id: plan.variantId
              })
            });
            const orderResult = await orderRes.json();
            if (orderResult.success) {
              this.showNotification(`Order #${orderResult.order_number} created! Subscription active.`, 'success');
              setTimeout(() => { window.location.href = '/pages/subscription-management'; }, 3000);
            } else {
              this.showNotification('Payment done but order creation failed. We will contact you.', 'warning');
              console.error('Order creation failed:', orderResult.error);
            }
          } catch (err) {
            console.error('Order creation error:', err);
            this.showNotification('Payment done! Order will be created shortly.', 'success');
            setTimeout(() => { window.location.href = '/pages/subscription-management'; }, 3000);
          }
        } else {
          this.showNotification('Subscription activation failed', 'error');
        }
      },
      modal: {
        ondismiss: () => this.showNotification('Subscription setup cancelled', 'warning'),
        escape: true,
        confirm_close: true
      },
      notes: {
        subscription_type: 'mandate',
        plan_name: plan.name,
        plan_frequency: plan.frequency,
        boxes: boxLabel,
        items: padSelection
      },
      theme: { color: '#8B1A1A' },
      prefill: {
        email: this.customerEmail || document.getElementById('customerEmail')?.value || '',
        contact: this.customerPhone || document.getElementById('customerPhone')?.value || ''
      }
    };

    try {
      const rzp = new Razorpay(options);
      rzp.open();
    } catch (error) {
      this.showNotification(`Failed to open payment: ${error.message}`, 'error');
    }
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
