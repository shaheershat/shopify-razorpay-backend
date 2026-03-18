# Shopify-Razorpay Integration Guide

## Overview
This guide shows how to integrate the subscription system into your Shopify store.

## 1. Product Page Setup

### Add to Your Shopify Theme
1. Go to Shopify Admin → Online Store → Themes
2. Edit your theme code
3. Create a new template: `product.subscription.liquid`
4. Copy the content from `shopify-product-page.html` and adapt it for Liquid

### Product Configuration
For each product you want to offer subscriptions:
1. Go to Products → Select Product
2. Add these product tags: `subscription`, `razorpay`
3. Set up product variants for different subscription lengths
4. Add product metafields for plan IDs

## 2. Subscription Management Page

### Create New Page in Shopify
1. Go to Online Store → Pages → Add Page
2. Page Title: "Subscription Management"
3. Template: `page.subscription-management.liquid`
4. Copy content from `subscription-management.html`

### Customer Account Access
Add this to your theme's customer account template:
```liquid
{% if customer %}
  <a href="/pages/subscription-management" class="btn">Manage Subscriptions</a>
{% endif %}
```

## 3. Backend Integration

### Update Environment Variables
Make sure your Railway environment variables include:
```
SHOPIFY_STORE_NAME=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_token
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_SECRET_KEY=your_razorpay_secret_key
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

### Shopify API Setup
1. Create a Shopify App: https://partners.shopify.com/
2. Set these Admin API access scopes:
   - `read_orders`
   - `write_orders`
   - `read_products`
   - `read_customers`
   - `write_customers`

3. Install the app on your store
4. Get the Admin API access token

## 4. Product Plan Mapping

### Update Product Variants
In your Shopify products, map variants to Razorpay plans:

```javascript
const planMapping = {
    'product-variant-1': {
        planId: 'plan_SSBkeTxGhyv39t',
        frequency: 3,
        price: 999,
        name: 'Monthly for 3 Months'
    },
    'product-variant-2': {
        planId: 'plan_SSBkeTxGhyv39t',
        frequency: 6,
        price: 949,
        name: 'Monthly for 6 Months'
    },
    'product-variant-3': {
        planId: 'plan_SSBkeTxGhyv39t',
        frequency: 12,
        price: 899,
        name: 'Monthly for 12 Months'
    }
};
```

## 5. Webhook Configuration

### Razorpay Webhooks
1. Go to Razorpay Dashboard → Webhooks
2. Add webhook URL: `https://your-backend-url.up.railway.app/webhooks/razorpay`
3. Select these events:
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.cancelled`
   - `subscription.halted`
   - `payment.authorized`
   - `payment.failed`

### Shopify Webhooks (Optional)
Set up Shopify webhooks to sync order updates back to your system.

## 6. Customer Data Flow

### Subscription Creation Flow:
1. Customer selects product and frequency on product page
2. Customer enters email and phone
3. Razorpay payment modal opens
4. Payment is processed
5. Subscription is created in Razorpay
6. Order is created in Shopify
7. Customer can manage subscriptions in account area

### Subscription Management Flow:
1. Customer logs into Shopify account
2. Clicks "Manage Subscriptions"
3. Sees all active subscriptions
4. Can pause, resume, skip, or cancel
5. Actions are processed via backend API
6. Shopify orders are updated accordingly

## 7. Testing

### Test Subscription Flow:
1. Use Razorpay test keys for development
2. Create test subscriptions
3. Verify orders appear in Shopify
4. Test subscription management actions

### Test Webhooks:
1. Use ngrok or similar for local testing
2. Test webhook events manually
3. Verify Shopify order creation

## 8. Production Deployment

### Switch to Live Keys:
1. Update Razorpay keys in Railway
2. Test with live payments
3. Monitor webhook processing
4. Set up error monitoring

### Monitoring:
1. Monitor Railway logs for errors
2. Track subscription metrics
3. Set up alerts for failed payments
4. Regular webhook health checks

## 9. Customization

### Branding:
- Update colors and styling to match your theme
- Add your logo to payment pages
- Customize email notifications

### Additional Features:
- Subscription analytics dashboard
- Customer notification emails
- Advanced subscription rules
- Multi-currency support

## 10. Support

### Common Issues:
- Webhook failures: Check URL and secrets
- Payment failures: Verify API keys
- Order sync issues: Check Shopify permissions
- Customer access: Verify customer accounts

### Debugging:
- Check Railway logs
- Verify webhook signatures
- Test API endpoints manually
- Monitor Shopify order creation

## Quick Start Checklist:

- [ ] Create Shopify app with correct permissions
- [ ] Update environment variables in Railway
- [ ] Create product subscription pages
- [ ] Set up Razorpay webhooks
- [ ] Test subscription flow
- [ ] Deploy to production
- [ ] Monitor and optimize

Your Shopify-Razorpay subscription system is now ready!
