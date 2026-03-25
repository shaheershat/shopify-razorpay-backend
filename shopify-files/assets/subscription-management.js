// Subscription Management JavaScript
class SubscriptionManagement {
  constructor() {
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    
    // Use logged-in customer data for comparison
    this.customerId = window.subscriptionConfig?.customerId;
    this.customerEmail = window.subscriptionConfig?.customerEmail;
    this.customerPhone = window.subscriptionConfig?.customerPhone;
    
    this.subscriptions = [];
    this.shopifyOrders = [];
    this.currentAction = null;
    this.currentSubscriptionId = null;
    this.currentFilter = 'active'; // Default filter
    
    this.init();
  }
  
  init() {
    this.loadSubscriptions();
    this.initializeModal();
    this.initializeTabListeners();
    this.initializeGlobalClickDebug();
  }
  
  initializeGlobalClickDebug() {
    // Debug global clicks to see what's blocking interactions
    document.addEventListener('click', (e) => {
      console.log('Global click detected:', {
        target: e.target,
        tagName: e.target.tagName,
        className: e.target.className,
        isClickable: e.target.style.pointerEvents !== 'none',
        zIndex: window.getComputedStyle(e.target).zIndex
      });
    });
  }
  
  initializeTabListeners() {
    // Add event delegation for tab clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('status-tab')) {
        e.preventDefault();
        e.stopPropagation();
        const filter = e.target.dataset.filter;
        if (filter) {
          console.log('Tab clicked:', filter);
          this.setFilter(filter);
        }
      }
    });
    
    // Also add direct event listeners to tabs for better compatibility
    document.querySelectorAll('.status-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filter = tab.dataset.filter;
        if (filter) {
          console.log('Tab clicked directly:', filter);
          this.setFilter(filter);
        }
      });
    });
    
    // Debug: Check if tabs exist
    console.log('Tabs found:', document.querySelectorAll('.status-tab').length);
  }
  
  setFilter(filter) {
    this.currentFilter = filter;
    
    // Update tab styles
    document.querySelectorAll('.status-tab').forEach(tab => {
      if (tab.dataset.filter === filter) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Re-render subscriptions with new filter
    this.renderSubscriptions();
  }
  
  initializeModal() {
    const modal = document.getElementById('actionModal');
    const confirmBtn = document.getElementById('confirmAction');
    const cancelBtn = document.getElementById('cancelAction');
    
    // Debug: Check if modal elements exist
    console.log('Modal elements:', { modal, confirmBtn, cancelBtn });
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Confirm button clicked');
        this.executeModalAction();
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Cancel button clicked');
        this.hideModal();
      });
    }
    
    // Close modal when clicking outside
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          console.log('Modal background clicked');
          this.hideModal();
        }
      });
    }
  }
  
  showModal(title, message, action, subscriptionId) {
    const modal = document.getElementById('actionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    
    if (modal && modalTitle && modalMessage) {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modal.style.display = 'flex';
      
      this.currentAction = action;
      this.currentSubscriptionId = subscriptionId;
    }
  }
  
  hideModal() {
    const modal = document.getElementById('actionModal');
    if (modal) {
      modal.style.display = 'none'; // Use style.display instead of classList
      console.log('Modal hidden');
    }
    this.currentAction = null;
    this.currentSubscriptionId = null;
  }
  
  async loadSubscriptions() {
    try {
      this.showLoading();
      
      // Load both Razorpay subscriptions and Shopify orders concurrently
      const [subscriptionsResponse, ordersResponse] = await Promise.all([
        this.fetchRazorpaySubscriptions(),
        this.fetchShopifyOrders()
      ]);
      
      this.subscriptions = subscriptionsResponse.subscriptions || subscriptionsResponse || [];
      this.shopifyOrders = ordersResponse;
      
      this.renderSubscriptions();
      this.hideLoading();
      
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      this.showError('Failed to load subscriptions: ' + error.message);
      this.hideLoading();
    }
  }
  
  async fetchRazorpaySubscriptions() {
    // Debug: Check configuration
    console.log('🔍 Checking subscriptions for logged-in customer:');
    console.log('  - Customer ID:', this.customerId);
    console.log('  - Email:', this.customerEmail);
    console.log('  - Phone:', this.customerPhone);
    console.log('  - API Base:', this.apiBase);
    
    // Load all subscriptions and filter by notes
    const response = await fetch(`${this.apiBase}/api/customer-subscriptions-by-notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer_email: this.customerEmail,
        customer_phone: this.customerPhone
      })
    });
    
    console.log('API Response Status:', response.status);
    
    const result = await response.json();
    console.log('API Response Data:', result);
    
    if (result.success) {
      return result;
    } else {
      console.error('Failed to load subscriptions:', result.error);
      return { subscriptions: [] };
    }
  }
  
  async fetchShopifyOrders() {
    try {
      // Fetch Shopify orders for the customer
      const response = await fetch(`/api/2023-10/orders.json?customer_id=${this.customerId}&status=any`);
      const data = await response.json();
      return data.orders || [];
    } catch (error) {
      console.error('Error fetching Shopify orders:', error);
      return [];
    }
  }
  
  renderSubscriptions() {
    const loadingState = document.getElementById('loadingState');
    const subscriptionsList = document.getElementById('subscriptionsList');
    const emptyState = document.getElementById('emptyState');
    const subscriptionTabs = document.getElementById('subscriptionTabs');

    if (loadingState) loadingState.classList.add('hidden');

    // Update tab counts
    this.updateTabCounts();

    // Show tabs if there are any subscriptions
    if (this.subscriptions.length > 0 && subscriptionTabs) {
      subscriptionTabs.classList.remove('hidden');
    }

    // Filter subscriptions based on current filter
    const filteredSubscriptions = this.subscriptions.filter(sub => sub.status === this.currentFilter);

    if (filteredSubscriptions.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (subscriptionsList) subscriptionsList.classList.add('hidden');
      
      // Update empty state based on current filter
      this.updateEmptyState();
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (subscriptionsList) subscriptionsList.classList.remove('hidden');
      
      // Render filtered subscriptions
      subscriptionsList.innerHTML = filteredSubscriptions.map(subscription => this.createSubscriptionCard(subscription)).join('');
    }
  }
  
  updateTabCounts() {
    const counts = {
      active: this.subscriptions.filter(s => s.status === 'active').length,
      paused: this.subscriptions.filter(s => s.status === 'paused').length,
      cancelled: this.subscriptions.filter(s => s.status === 'cancelled').length,
      completed: this.subscriptions.filter(s => s.status === 'completed').length
    };

    // Update count elements
    const activeCount = document.getElementById('activeCount');
    const pausedCount = document.getElementById('pausedCount');
    const cancelledCount = document.getElementById('cancelledCount');
    const completedCount = document.getElementById('completedCount');

    if (activeCount) activeCount.textContent = counts.active;
    if (pausedCount) pausedCount.textContent = counts.paused;
    if (cancelledCount) cancelledCount.textContent = counts.cancelled;
    if (completedCount) completedCount.textContent = counts.completed;
  }

  updateEmptyState() {
    const emptyStateTitle = document.getElementById('emptyStateTitle');
    const emptyStateMessage = document.getElementById('emptyStateMessage');

    const emptyStateMessages = {
      active: {
        title: 'No Active Subscriptions',
        message: 'You don\'t have any active subscriptions yet.'
      },
      paused: {
        title: 'No Paused Subscriptions',
        message: 'You don\'t have any paused subscriptions.'
      },
      cancelled: {
        title: 'No Cancelled Subscriptions',
        message: 'You don\'t have any cancelled subscriptions.'
      },
      completed: {
        title: 'No Completed Subscriptions',
        message: 'You don\'t have any completed subscriptions.'
      }
    };

    const currentMessage = emptyStateMessages[this.currentFilter] || emptyStateMessages.active;

    if (emptyStateTitle) emptyStateTitle.textContent = currentMessage.title;
    if (emptyStateMessage) emptyStateMessage.textContent = currentMessage.message;
  }
  
  createSubscriptionCard(subscription) {
    const statusColors = {
      'active': 'bg-green-100 text-green-800',
      'paused': 'bg-yellow-100 text-yellow-800',
      'cancelled': 'bg-red-100 text-red-800',
      'completed': 'bg-gray-100 text-gray-800'
    };

    const statusText = {
      'active': 'ACTIVE',
      'paused': 'PAUSED',
      'cancelled': 'CANCELLED',
      'completed': 'COMPLETED'
    };

    const progressPercentage = (subscription.paid_count / subscription.total_count) * 100;
    const nextPaymentDate = subscription.next_charge_at ? this.formatDate(subscription.next_charge_at) : 'N/A';
    
    // Convert amount from paise to rupees
    const price = (subscription.amount / 100).toFixed(2);
    
    // Format dates
    const startDate = this.formatShortDate(subscription.current_period_start);
    const endDate = this.formatShortDate(subscription.current_period_end);
    
    // Get all Razorpay details with proper field mapping
    const subscriptionId = subscription.id || subscription.subscription_id || 'N/A';
    const customerId = subscription.customer_id || subscription.customer?.id || 'N/A';
    const planId = subscription.plan_id || subscription.plan?.id || 'N/A';
    const createdAt = subscription.created_at ? this.formatDate(subscription.created_at) : 
                      subscription.start_at ? this.formatDate(subscription.start_at) : 'N/A';
    const authStatus = subscription.auth_status || subscription.status || 'N/A';
    const totalCount = subscription.total_count || subscription.quantity || 'N/A';
    const paidCount = subscription.paid_count || subscription.paid_count || '0';
    const remainingCount = (totalCount - paidCount) || '0';
    
    // Get customer details from notes or direct fields
    const customerEmail = subscription.customer_email || 
                         subscription.notes?.customer_email || 
                         subscription.customer?.email || 'N/A';
    const customerPhone = subscription.customer_phone || 
                         subscription.notes?.customer_phone || 
                         subscription.customer?.phone || 'N/A';

    // Get product details from Razorpay subscription
    const productName = subscription.product_title || subscription.plan?.name || subscription.plan_name || 'Subscription Product';
    const productVariant = subscription.plan_id || subscription.variant_id || 'N/A';
    
    // Get Shopify order data for this subscription
    const shopifyOrder = this.getShopifyOrderForSubscription(subscriptionId);
    const shopifyProducts = shopifyOrder?.line_items || [];
    
    // Extract address from Razorpay notes
    const deliveryAddress = this.extractAddressFromNotes(subscription.notes);

    // Status badge styling
    const statusBadgeClass = subscription.status === 'active' ? 'bg-green-100 text-green-800' : 
                          subscription.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                          subscription.status === 'cancelled' ? 'bg-red-100 text-red-800' : 
                          'bg-gray-100 text-gray-800';

    const statusBadgeText = statusText[subscription.status] || subscription.status.toUpperCase();

    return `
      <div class="subscription-card" data-status="${subscription.status}">
        <!-- Card Header -->
        <div class="card-header">
          <div class="plan-info">
            <div class="plan-title">${productName}</div>
            <span class="status-badge ${statusBadgeClass}">${statusBadgeText}</span>
          </div>
          <div class="price-section">
            <div class="price">₹${price}</div>
            <div class="price-label">Per month</div>
          </div>
        </div>

        <!-- Key Info -->
        <div class="key-info">
          <div class="info-item">
            <div class="info-label">Next Delivery</div>
            <div class="info-value">${nextPaymentDate}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Duration</div>
            <div class="info-value">${totalCount} months</div>
          </div>
        </div>

        <!-- Product Details -->
        <div class="product-section">
          <div class="section-title">Product Details</div>
          <div class="product-grid">
            ${shopifyProducts.length > 0 ? this.createProductItems(shopifyProducts) : `
              <div class="product-item">
                <div class="product-image-placeholder">📦</div>
                <div class="product-info">
                  <div class="product-title">${productName}</div>
                  <div class="product-details">Variant ID: ${productVariant}</div>
                </div>
              </div>
            `}
          </div>
        </div>

        <!-- Additional Info -->
        <div class="additional-info">
          <div class="info-box">
            <div class="info-box-label">Delivery Address</div>
            <div class="info-box-value">${deliveryAddress}</div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="button-group">
          ${this.getActionButtons(subscription)}
        </div>
      </div>
    `;
  }
  
  getShopifyOrderForSubscription(subscriptionId) {
    // Find matching Shopify order for this subscription
    return this.shopifyOrders.find(order => 
      order.note?.includes(subscriptionId) || 
      order.attributes?.some(attr => attr.value === subscriptionId)
    ) || {};
  }
  
  extractAddressFromNotes(notes) {
    if (!notes) return 'Home';
    
    // Try to extract address from notes
    const addressFields = [
      'delivery_address',
      'shipping_address', 
      'address',
      'customer_address'
    ];
    
    for (const field of addressFields) {
      if (notes[field]) {
        return notes[field];
      }
    }
    
    // If no specific field found, try to parse from note text
    if (notes.customer_note || notes.note) {
      const noteText = notes.customer_note || notes.note;
      const addressMatch = noteText.match(/address[:\s]+([^,\n]+)/i);
      if (addressMatch && addressMatch[1]) {
        return addressMatch[1].trim();
      }
    }
    
    return 'Home'; // Default fallback
  }
  
  createProductItems(products) {
    if (!products || products.length === 0) {
      return '<div class="text-gray-500 text-sm">No products found</div>';
    }
    
    return products.map(product => `
      <div class="product-item">
        ${product.image ? `<img src="${product.image}" alt="${product.title}" class="product-image">` : '<div class="product-image-placeholder">📦</div>'}
        <div class="product-info">
          <div class="product-title">${product.title}</div>
          <div class="product-details">${product.quantity} × ${product.price}</div>
        </div>
      </div>
    `).join('');
  }
  
  getActionButtons(subscription) {
    const buttons = [];
    
    switch (subscription.status) {
      case 'active':
        buttons.push(
          `<button onclick="subscriptionManagement.pauseSubscription('${subscription.id}')" class="button button-secondary">⏸ Pause</button>`,
          `<button onclick="subscriptionManagement.skipPayment('${subscription.id}')" class="button button-secondary">⊲ Skip</button>`,
          `<button onclick="subscriptionManagement.cancelSubscription('${subscription.id}')" class="button button-danger">✕ Cancel</button>`
        );
        break;
      case 'paused':
        buttons.push(
          `<button onclick="subscriptionManagement.resumeSubscription('${subscription.id}')" class="button button-primary">▶ Resume</button>`,
          `<button onclick="subscriptionManagement.cancelSubscription('${subscription.id}')" class="button button-danger">✕ Cancel</button>`
        );
        break;
      case 'cancelled':
        buttons.push(
          `<button onclick="subscriptionManagement.reactivateSubscription('${subscription.id}')" class="button button-primary">↻ Reactivate</button>`
        );
        break;
      case 'completed':
        buttons.push(
          `<button onclick="subscriptionManagement.viewDetails('${subscription.id}')" class="button button-secondary">📋 View Details</button>`,
          `<button onclick="subscriptionManagement.renewSubscription('${subscription.id}')" class="button button-primary">↻ Renew</button>`
        );
        break;
    }
    
    return buttons.join('');
  }
  
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  
  formatShortDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (error) {
      console.error('Error formatting short date:', error);
      return dateString;
    }
  }
  
  initializeModal() {
    const modal = document.getElementById('actionModal');
    const confirmBtn = document.getElementById('confirmAction');
    const cancelBtn = document.getElementById('cancelAction');

    if (modal) {
      // Hide modal initially
      modal.style.display = 'none';
      
      // Confirm button
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => this.executeAction());
      }
      
      // Cancel button
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.hideModal());
      }
      
      // Close modal when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideModal();
        }
      });
    }
  }
  
  showModal(title, message, action, subscriptionId) {
    const modal = document.getElementById('actionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    
    if (modal && modalTitle && modalMessage) {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modal.style.display = 'flex'; // Use style.display instead of classList
      
      this.currentAction = action;
      this.currentSubscriptionId = subscriptionId;
      
      console.log('Modal shown:', { title, message, action, subscriptionId });
    } else {
      console.error('Modal elements not found:', { modal, modalTitle, modalMessage, confirmBtn, cancelBtn });
    }
  }

  hideModal() {
    const modal = document.getElementById('actionModal');
    if (modal) {
      modal.style.display = 'none'; // Use style.display instead of classList
      console.log('Modal hidden');
    }
    this.currentAction = null;
    this.currentSubscriptionId = null;
  }
  
  editSubscription(subscriptionId) {
    this.showModal(
      'Edit Subscription', 
      'Are you sure you want to edit this subscription? You can modify delivery preferences and product selections.', 
      'edit', 
      subscriptionId
    );
  }
  
  reactivateSubscription(subscriptionId) {
    this.showModal(
      'Reactivate Subscription', 
      'Are you sure you want to reactivate this subscription?', 
      'reactivate', 
      subscriptionId
    );
  }
  
  viewDetails(subscriptionId) {
    // Navigate to subscription details page or show detailed modal
    console.log('Viewing details for subscription:', subscriptionId);
    this.showNotification('Opening subscription details...', 'info');
  }
  
  renewSubscription(subscriptionId) {
    this.showModal(
      'Renew Subscription', 
      'Are you sure you want to renew this subscription? A new subscription cycle will begin.', 
      'renew', 
      subscriptionId
    );
  }
  
  async executeModalAction() {
    if (!this.currentAction || !this.currentSubscriptionId) return;
    
    try {
      let endpoint;
      let actionText;
      let successMessage;

      switch (this.currentAction) {
        case 'pause':
          endpoint = '/api/subscriptions/pause';
          actionText = 'pausing';
          successMessage = 'Subscription paused successfully';
          break;
        case 'resume':
          endpoint = '/api/subscriptions/resume';
          actionText = 'resuming';
          successMessage = 'Subscription resumed successfully';
          break;
        case 'skip':
          endpoint = '/api/subscriptions/skip';
          actionText = 'skipping payment for';
          successMessage = 'Next payment skipped successfully';
          break;
        case 'cancel':
          endpoint = '/api/subscriptions/cancel';
          actionText = 'cancelling';
          successMessage = 'Subscription cancelled successfully';
          break;
        case 'edit':
          endpoint = '/api/subscriptions/edit';
          actionText = 'editing';
          successMessage = 'Subscription updated successfully';
          break;
        case 'reactivate':
          endpoint = '/api/subscriptions/reactivate';
          actionText = 'reactivating';
          successMessage = 'Subscription reactivated successfully';
          break;
        case 'renew':
          endpoint = '/api/subscriptions/renew';
          actionText = 'renewing';
          successMessage = 'Subscription renewed successfully';
          break;
      }

      this.showLoading(`${actionText} subscription...`);

      const response = await fetch(`${this.apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription_id: this.currentSubscriptionId
        })
      });

      const result = await response.json();

      this.hideLoading();

      if (result.success) {
        this.showNotification(successMessage, 'success');
        this.hideModal();
        // Reload subscriptions to show updated status
        await this.loadSubscriptions();
      } else {
        this.showNotification(`Failed to ${actionText} subscription: ${result.error}`, 'error');
      }
    } catch (error) {
      this.hideLoading();
      this.showNotification(`Error: ${error.message}`, 'error');
    }
  }

  // Action methods - use modal for confirmation
  pauseSubscription(subscriptionId) {
    this.showModal(
      'Pause Subscription', 
      'Are you sure you want to pause this subscription? You can resume it later.', 
      'pause', 
      subscriptionId
    );
  }

  resumeSubscription(subscriptionId) {
    this.showModal(
      'Resume Subscription', 
      'Are you sure you want to resume this subscription?', 
      'resume', 
      subscriptionId
    );
  }

  skipPayment(subscriptionId) {
    this.showModal(
      'Skip Next Payment', 
      'Are you sure you want to skip the next payment? The next payment date will be extended.', 
      'skip', 
      subscriptionId
    );
  }

  cancelSubscription(subscriptionId) {
    this.showModal(
      'Cancel Subscription', 
      'Are you sure you want to cancel this subscription? This action cannot be undone.', 
      'cancel', 
      subscriptionId
    );
  }
  
  createNewSubscription() {
    window.location.href = '/collections/all';
  }
  
  // Helper method to get customer phone
  getCustomerPhone() {
    // Try to get phone from template config or from customer object
    const phoneFromConfig = window.subscriptionConfig?.customerPhone;
    if (phoneFromConfig && phoneFromConfig !== 'null' && phoneFromConfig !== '') {
      return phoneFromConfig;
    }
    
    // Try to get from Shopify customer object if available
    if (window.Shopify && window.Shopify.customer && window.Shopify.customer.phone) {
      return window.Shopify.customer.phone;
    }
    
    return null;
  }
  
  // Utility functions
  showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }
  
  showLoading() {
    const loadingState = document.getElementById('loadingState');
    const subscriptionsList = document.getElementById('subscriptionsList');
    
    if (loadingState) loadingState.classList.remove('hidden');
    if (subscriptionsList) subscriptionsList.classList.add('hidden');
  }
  
  hideLoading() {
    const loadingState = document.getElementById('loadingState');
    
    if (loadingState) loadingState.classList.add('hidden');
  }
  
  showError(message) {
    this.showNotification(message, 'error');
  }
  
  formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (!window.subscriptionManagement) {
    console.log('Initializing Subscription Management from DOMContentLoaded');
    window.subscriptionManagement = new SubscriptionManagement();
  }
});

// Fallback initialization for cases where DOM is already loaded
if (document.readyState !== 'loading' && !window.subscriptionManagement) {
  console.log('DOM already loaded - initializing Subscription Management immediately');
  window.subscriptionManagement = new SubscriptionManagement();
}
