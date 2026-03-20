// Subscription Management JavaScript
class SubscriptionManagement {
  constructor() {
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    
    // Use logged-in customer data for comparison
    this.customerId = window.subscriptionConfig?.customerId;
    this.customerEmail = window.subscriptionConfig?.customerEmail;
    this.customerPhone = window.subscriptionConfig?.customerPhone;
    
    this.subscriptions = [];
    this.currentAction = null;
    this.currentSubscriptionId = null;
    this.currentFilter = 'active'; // Default filter
    
    this.init();
  }
  
  init() {
    this.loadSubscriptions();
    this.initializeModal();
    this.initializeTabListeners();
  }
  
  initializeTabListeners() {
    // Add event delegation for tab clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('subscription-tab')) {
        const filter = e.target.dataset.filter;
        this.setFilter(filter);
      }
    });
  }
  
  setFilter(filter) {
    this.currentFilter = filter;
    this.renderSubscriptions();
  }
  
  initializeModal() {
    const modal = document.getElementById('actionModal');
    const confirmBtn = document.getElementById('confirmAction');
    const cancelBtn = document.getElementById('cancelAction');
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.executeModalAction());
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideModal());
    }
    
    // Close modal when clicking outside
    if (modal) {
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
      modal.style.display = 'flex';
      
      this.currentAction = action;
      this.currentSubscriptionId = subscriptionId;
    }
  }
  
  hideModal() {
    const modal = document.getElementById('actionModal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.currentAction = null;
    this.currentSubscriptionId = null;
  }
  
  async executeModalAction() {
    if (!this.currentAction || !this.currentSubscriptionId) return;
    
    const actionText = this.currentAction.charAt(0).toUpperCase() + this.currentAction.slice(1);
    
    try {
      this.showLoading();
      
      const response = await fetch(`${this.apiBase}/api/subscriptions/${this.currentAction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription_id: this.currentSubscriptionId
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification(`Subscription ${actionText} successfully`, 'success');
        await this.loadSubscriptions();
      } else {
        this.showNotification(`Failed to ${actionText} subscription: ${result.error}`, 'error');
      }
    } catch (error) {
      this.hideLoading();
      this.showNotification(`Error: ${error.message}`, 'error');
    }
    
    this.hideModal();
    this.hideLoading();
  }
  
  async loadSubscriptions() {
    try {
      this.showLoading();
      
      // Debug: Check configuration
      console.log('� Checking subscriptions for logged-in customer:');
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
        this.subscriptions = result.subscriptions || [];
        console.log('Subscriptions found by notes matching:', this.subscriptions.length);
      } else {
        console.error('Failed to load subscriptions:', result.error);
        this.subscriptions = [];
      }
      
      // If no subscriptions found by notes, try traditional methods as fallback
      if (this.subscriptions.length === 0) {
        console.log('No subscriptions found by notes, trying traditional methods...');
        
        // Try email lookup
        if (this.customerEmail) {
          try {
            const emailResponse = await fetch(`${this.apiBase}/api/customer-subscriptions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                customer_email: this.customerEmail
              })
            });
            
            if (emailResponse.ok) {
              const emailResult = await emailResponse.json();
              if (emailResult.success && emailResult.subscriptions.length > 0) {
                this.subscriptions = emailResult.subscriptions;
                console.log('Found subscriptions by email:', this.subscriptions.length);
              }
            }
          } catch (emailError) {
            console.log('Email lookup failed:', emailError.message);
          }
        }
        
        // Try phone lookup
        if (this.subscriptions.length === 0 && this.customerPhone) {
          try {
            const phoneResponse = await fetch(`${this.apiBase}/api/customer-subscriptions-by-phone`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                customer_phone: this.customerPhone
              })
            });
            
            if (phoneResponse.ok) {
              const phoneResult = await phoneResponse.json();
              if (phoneResult.success && phoneResult.subscriptions.length > 0) {
                this.subscriptions = phoneResult.subscriptions;
                console.log('Found subscriptions by phone:', this.subscriptions.length);
              }
            }
          } catch (phoneError) {
            console.log('Phone lookup failed:', phoneError.message);
          }
        }
      }
      
      this.renderSubscriptions();
      this.hideLoading();
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      this.showError('Failed to load subscriptions: ' + error.message);
      this.hideLoading();
    }
  }
  
  renderSubscriptions() {
    const loadingState = document.getElementById('loadingState');
    const subscriptionsList = document.getElementById('subscriptionsList');
    const emptyState = document.getElementById('emptyState');

    if (loadingState) loadingState.classList.add('hidden');

    // Filter subscriptions based on current filter
    const filteredSubscriptions = this.subscriptions.filter(sub => sub.status === this.currentFilter);

    if (filteredSubscriptions.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (subscriptionsList) subscriptionsList.classList.add('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (subscriptionsList) subscriptionsList.classList.remove('hidden');
      
      subscriptionsList.innerHTML = this.renderSubscriptionTabs() + 
        filteredSubscriptions.map(subscription => this.createSubscriptionCard(subscription)).join('');
    }
  }

  renderSubscriptionTabs() {
    const counts = {
      active: this.subscriptions.filter(s => s.status === 'active').length,
      paused: this.subscriptions.filter(s => s.status === 'paused').length,
      cancelled: this.subscriptions.filter(s => s.status === 'cancelled').length,
      completed: this.subscriptions.filter(s => s.status === 'completed').length
    };

    return `
      <div class="bg-white rounded-lg shadow-md p-4 mb-6">
        <div class="flex flex-wrap gap-2 border-b border-gray-200">
          <button class="subscription-tab px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            this.currentFilter === 'active' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }" data-filter="active">
            Active (${counts.active})
          </button>
          <button class="subscription-tab px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            this.currentFilter === 'paused' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }" data-filter="paused">
            Paused (${counts.paused})
          </button>
          <button class="subscription-tab px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            this.currentFilter === 'cancelled' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }" data-filter="cancelled">
            Cancelled (${counts.cancelled})
          </button>
          <button class="subscription-tab px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            this.currentFilter === 'completed' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }" data-filter="completed">
            Completed (${counts.completed})
          </button>
        </div>
      </div>
    `;
  }
  
  createSubscriptionCard(subscription) {
    const statusColors = {
      'active': 'bg-green-100 text-green-800',
      'paused': 'bg-yellow-100 text-yellow-800',
      'cancelled': 'bg-red-100 text-red-800',
      'completed': 'bg-gray-100 text-gray-800'
    };

    const statusText = {
      'active': 'Active',
      'paused': 'Paused',
      'cancelled': 'Cancelled',
      'completed': 'Completed'
    };

    const progressPercentage = (subscription.paid_count / subscription.total_count) * 100;
    const nextPaymentDate = subscription.next_charge_at ? this.formatDate(subscription.next_charge_at) : 'N/A';
    
    // Convert amount from paise to rupees
    const price = (subscription.amount / 100).toFixed(2);

    return `
      <div class="bg-white rounded-lg shadow-md p-4 md:p-6 mb-4 md:mb-6" data-subscription-id="${subscription.id}">
        <div class="flex flex-col md:flex-row md:justify-between md:items-start mb-4">
          <div class="flex-1 mb-4 md:mb-0">
            <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
              <h3 class="text-lg md:text-xl font-semibold text-gray-900">${subscription.product_title}</h3>
              <span class="px-3 py-1 rounded-full text-xs md:text-sm font-medium ${statusColors[subscription.status] || 'bg-gray-100 text-gray-800'}">
                ${statusText[subscription.status] || subscription.status}
              </span>
            </div>
            <p class="text-gray-600 text-sm md:text-base mb-2">${subscription.product_description}</p>
            <div class="text-xs md:text-sm text-gray-500">
              <span>Subscription ID: ${subscription.id}</span>
            </div>
          </div>
          <div class="text-left md:text-right">
            <div class="text-xl md:text-2xl font-bold text-gray-900">₹${price}</div>
            <div class="text-xs md:text-sm text-gray-500">per month</div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
          <div class="bg-gray-50 p-3 md:p-4 rounded-lg">
            <div class="text-xs md:text-sm text-gray-500 mb-1">Customer Email</div>
            <div class="text-sm md:font-medium text-gray-900 break-all">${subscription.customer_email || 'N/A'}</div>
          </div>
          <div class="bg-gray-50 p-3 md:p-4 rounded-lg">
            <div class="text-xs md:text-sm text-gray-500 mb-1">Customer Phone</div>
            <div class="text-sm md:font-medium text-gray-900">${subscription.customer_phone || 'N/A'}</div>
          </div>
          <div class="bg-gray-50 p-3 md:p-4 rounded-lg">
            <div class="text-xs md:text-sm text-gray-500 mb-1">Next Charge Date</div>
            <div class="text-sm md:font-medium text-gray-900">${nextPaymentDate}</div>
          </div>
          <div class="bg-gray-50 p-3 md:p-4 rounded-lg">
            <div class="text-xs md:text-sm text-gray-500 mb-1">Payment Progress</div>
            <div class="text-sm md:font-medium text-gray-900">${subscription.paid_count} / ${subscription.total_count} payments</div>
            <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${progressPercentage}%"></div>
            </div>
          </div>
          <div class="bg-gray-50 p-3 md:p-4 rounded-lg">
            <div class="text-xs md:text-sm text-gray-500 mb-1">Started On</div>
            <div class="text-sm md:font-medium text-gray-900">${this.formatDate(subscription.current_period_start)}</div>
          </div>
          <div class="bg-gray-50 p-3 md:p-4 rounded-lg">
            <div class="text-xs md:text-sm text-gray-500 mb-1">Ends On</div>
            <div class="text-sm md:font-medium text-gray-900">${this.formatDate(subscription.current_period_end)}</div>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
          ${this.getActionButtons(subscription)}
        </div>
      </div>
    `;
  }
  
  getActionButtons(subscription) {
    const buttons = [];

    switch (subscription.status) {
      case 'active':
        buttons.push(
          `<button onclick="subscriptionManagement.pauseSubscription('${subscription.id}')" class="w-full bg-yellow-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-yellow-700 transition-colors">
            Pause
          </button>`,
          `<button onclick="subscriptionManagement.skipPayment('${subscription.id}')" class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Skip Next Payment
          </button>`,
          `<button onclick="subscriptionManagement.cancelSubscription('${subscription.id}')" class="w-full bg-red-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-red-700 transition-colors">
            Cancel
          </button>`
        );
        break;
      case 'paused':
        buttons.push(
          `<button onclick="subscriptionManagement.resumeSubscription('${subscription.id}')" class="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors">
            Resume
          </button>`,
          `<button onclick="subscriptionManagement.cancelSubscription('${subscription.id}')" class="w-full bg-red-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-red-700 transition-colors">
            Cancel
          </button>`
        );
        break;
      case 'cancelled':
      case 'completed':
        buttons.push(
          `<button onclick="subscriptionManagement.createNewSubscription()" class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Create New Subscription
          </button>`
        );
        break;
    }

    return buttons.join('');
  }
  
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
        cancelBtn.addEventListener('click', () => this.closeModal());
      }
      
      // Close modal when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      });
    }
  }
  
  showModal(title, message, action, subscriptionId) {
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modal = document.getElementById('actionModal');
    
    if (modalTitle) modalTitle.textContent = title;
    if (modalMessage) modalMessage.textContent = message;
    if (modal) modal.classList.remove('hidden');
    
    this.currentAction = action;
    this.currentSubscriptionId = subscriptionId;
  }
  
  closeModal() {
    const modal = document.getElementById('actionModal');
    if (modal) modal.classList.add('hidden');
    
    this.currentAction = null;
    this.currentSubscriptionId = null;
  }
  
  async executeAction() {
    if (!this.currentAction || !this.currentSubscriptionId) return;

    try {
      let endpoint;
      let actionText;

      switch (this.currentAction) {
        case 'pause':
          endpoint = '/api/subscriptions/pause';
          actionText = 'pausing';
          break;
        case 'resume':
          endpoint = '/api/subscriptions/resume';
          actionText = 'resuming';
          break;
        case 'skip':
          endpoint = '/api/subscriptions/skip';
          actionText = 'skipping payment for';
          break;
        case 'cancel':
          endpoint = '/api/subscriptions/cancel';
          actionText = 'cancelling';
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
        this.showNotification(`Subscription ${actionText} successful!`, 'success');
        this.closeModal();
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
    this.showModal('Pause Subscription', 'Are you sure you want to pause this subscription?', 'pause', subscriptionId);
  }

  resumeSubscription(subscriptionId) {
    this.showModal('Resume Subscription', 'Are you sure you want to resume this subscription?', 'resume', subscriptionId);
  }

  skipPayment(subscriptionId) {
    this.showModal('Skip Payment', 'Are you sure you want to skip the next payment?', 'skip', subscriptionId);
  }

  cancelSubscription(subscriptionId) {
    this.showModal('Cancel Subscription', 'Are you sure you want to cancel this subscription? This action cannot be undone.', 'cancel', subscriptionId);
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
  window.subscriptionManagement = new SubscriptionManagement();
});
