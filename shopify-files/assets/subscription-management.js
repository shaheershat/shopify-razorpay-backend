// Subscription Management JavaScript
class SubscriptionManagement {
  constructor() {
    this.apiBase = window.subscriptionConfig?.apiBase || 'https://shopify-razorpay-backend-production.up.railway.app';
    this.customerId = window.subscriptionConfig?.customerId;
    this.customerEmail = window.subscriptionConfig?.customerEmail;
    
    this.subscriptions = [];
    this.currentAction = null;
    this.currentSubscriptionId = null;
    
    this.init();
  }
  
  init() {
    this.loadSubscriptions();
    this.initializeModal();
  }
  
  async loadSubscriptions() {
    try {
      this.showLoading();
      
      // In a real implementation, you'd get customer ID from Shopify customer session
      // For now, we'll simulate loading subscriptions
      await this.simulateLoadingSubscriptions();
      
      this.renderSubscriptions();
      this.hideLoading();
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      this.showError('Failed to load subscriptions');
      this.hideLoading();
    }
  }
  
  async simulateLoadingSubscriptions() {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock data for demonstration
    // In production, you'd have an endpoint to fetch customer subscriptions
    this.subscriptions = [
      {
        id: 'sub_123456789',
        plan_name: 'Monthly for 3 Months',
        status: 'active',
        current_period_start: '2024-03-01',
        current_period_end: '2024-04-01',
        amount: 999,
        customer_email: this.customerEmail || 'customer@example.com',
        product_id: 'product1',
        total_count: 3,
        paid_count: 1,
        remaining_count: 2
      },
      {
        id: 'sub_987654321',
        plan_name: 'Monthly for 6 Months',
        status: 'paused',
        current_period_start: '2024-02-15',
        current_period_end: '2024-03-15',
        amount: 949,
        customer_email: this.customerEmail || 'customer@example.com',
        product_id: 'product2',
        total_count: 6,
        paid_count: 2,
        remaining_count: 4
      }
    ];
  }
  
  renderSubscriptions() {
    const loadingState = document.getElementById('loadingState');
    const subscriptionsList = document.getElementById('subscriptionsList');
    const emptyState = document.getElementById('emptyState');

    if (loadingState) loadingState.classList.add('hidden');

    if (this.subscriptions.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (subscriptionsList) subscriptionsList.classList.add('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (subscriptionsList) subscriptionsList.classList.remove('hidden');
      
      subscriptionsList.innerHTML = this.subscriptions.map(subscription => this.createSubscriptionCard(subscription)).join('');
    }
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

    return `
      <div class="bg-white rounded-lg shadow-lg p-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-xl font-bold">${subscription.plan_name}</h3>
              <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColors[subscription.status]}">
                ${statusText[subscription.status]}
              </span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p class="text-gray-600">Subscription ID:</p>
                <p class="font-medium">${subscription.id}</p>
              </div>
              <div>
                <p class="text-gray-600">Amount:</p>
                <p class="font-medium">₹${subscription.amount}/month</p>
              </div>
              <div>
                <p class="text-gray-600">Current Period:</p>
                <p class="font-medium">${this.formatDate(subscription.current_period_start)} - ${this.formatDate(subscription.current_period_end)}</p>
              </div>
              <div>
                <p class="text-gray-600">Progress:</p>
                <p class="font-medium">${subscription.paid_count}/${subscription.total_count} payments</p>
              </div>
            </div>
          </div>
          
          <div class="flex flex-col gap-2 min-w-[150px]">
            ${this.getActionButtons(subscription)}
          </div>
        </div>
        
        <!-- Progress Bar -->
        <div class="mt-4">
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full" style="width: ${(subscription.paid_count / subscription.total_count) * 100}%"></div>
          </div>
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

    if (confirmBtn) confirmBtn.addEventListener('click', () => this.executeAction());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

    // Close modal when clicking outside
    if (modal) {
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
  
  // Action functions
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
  
  // Utility functions
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
  
  showLoading(message = 'Loading...') {
    this.showNotification(message, 'info');
  }
  
  hideLoading() {
    // Remove loading notification if exists
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(n => n.remove());
  }
  
  showError(message) {
    this.showNotification(message, 'error');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.subscriptionManagement = new SubscriptionManagement();
});
