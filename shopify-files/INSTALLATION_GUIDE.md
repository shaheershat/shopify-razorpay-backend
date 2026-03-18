# Shopify Installation Guide

## Files to Add to Your Shopify Theme

### 📁 Templates
1. `templates/product.subscription.liquid` - Product page with subscription options
2. `templates/page.subscription-management.liquid` - Subscription management page
3. `templates/customers/account.liquid` - Updated customer account page

### 📁 Assets
1. `assets/subscription-product.css` - Styles for product page
2. `assets/subscription-product.js` - JavaScript for product functionality
3. `assets/subscription-management.css` - Styles for management page (same as product.css)
4. `assets/subscription-management.js` - JavaScript for management functionality

### 📁 Config
1. `config/settings_schema.json` - Theme settings for subscription configuration

## Step-by-Step Installation

### Step 1: Add Templates to Your Theme

1. Go to **Online Store** → **Themes**
2. Find your theme and click **Actions** → **Edit code**
3. Add these files:

#### Product Template
- Create new template: **Templates** → **Add a new template**
- Choose **Product** template
- Name it: `subscription`
- Copy the content from `templates/product.subscription.liquid`

#### Page Template
- Create new template: **Templates** → **Add a new template**
- Choose **Page** template
- Name it: `subscription-management`
- Copy the content from `templates/page.subscription-management.liquid`

#### Customer Account Template
- Replace existing: **Templates** → **customers** → **account.liquid**
- Copy the content from `templates/customers/account.liquid`

### Step 2: Add Assets

#### CSS Files
1. Go to **Assets** → **Add a new asset**
2. Create `subscription-product.css` with the provided CSS
3. Create `subscription-management.css` (you can copy the same content as product.css)

#### JavaScript Files
1. Go to **Assets** → **Add a new asset**
2. Create `subscription-product.js` with the provided JavaScript
3. Create `subscription-management.js` with the provided JavaScript

### Step 3: Add Theme Settings

1. Go to **Config** → **settings_schema.json**
2. Add the subscription configuration to your existing schema
3. **Important**: Merge with your existing settings, don't replace the entire file

### Step 4: Create Subscription Management Page

1. Go to **Online Store** → **Pages**
2. Click **Add page**
3. **Page title**: "Subscription Management"
4. **Content**: Leave empty (the template will handle everything)
5. **Template**: Choose `page.subscription-management`
6. **Handle**: `subscription-management`
7. **Save**

### Step 5: Configure Products for Subscriptions

#### Method 1: Using Product Tags
1. Go to **Products** → Select a product
2. Add the tag: `subscription`
3. Save the product

#### Method 2: Using Product Variants
For each subscription product, you need to set up variants with metafields:

1. **Create Variants** for different subscription lengths:
   - "Monthly for 3 Months"
   - "Monthly for 6 Months" 
   - "Monthly for 12 Months"

2. **Add Metafields** to each variant:
   - `custom.frequency` (text): "3months", "6months", "12months"
   - `custom.razorpay_plan_id` (text): "plan_SSBkeTxGhyv39t"
   - `custom.description` (text): "Pay monthly for 3 months", etc.

### Step 6: Configure Theme Settings

1. Go to **Online Store** → **Themes**
2. Click **Customize** on your theme
3. Look for "Subscription System" settings
4. Configure:
   - **Razorpay Key ID**: `rzp_live_SQfuiRsuG1eqca`
   - **Subscription API URL**: `https://shopify-razorpay-backend-production.up.railway.app`
   - **Enable Subscriptions**: Check this box
   - **Show Subscription Management**: Check this box

### Step 7: Assign Templates to Products

1. Go to **Products** → Select a subscription product
2. **Product template**: Choose `product.subscription`
3. Save the product

### Step 8: Set Up Product Metafields (Advanced)

If you want to use metafields for product configuration:

1. Go to **Settings** → **Metafields**
2. Create metafield definitions:
   - **Products** → **razorpay_plan_id** (Single line text)
   - **Products** → **subscription_frequency** (Single line text)
   - **Products** → **subscription_enabled** (Boolean)

3. Add metafields to your products with the subscription data

### Step 9: Test the Installation

1. **Product Page Test**:
   - Go to a product tagged with `subscription`
   - You should see subscription options
   - Try selecting a plan and entering customer info

2. **Subscription Management Test**:
   - Log in as a customer
   - Go to `/pages/subscription-management`
   - You should see the management interface

3. **Payment Test**:
   - Try creating a test subscription
   - Verify Razorpay modal opens
   - Check if backend processes the subscription

### Step 10: Set Up Webhooks

1. Go to your Razorpay Dashboard
2. Set webhook URL: `https://shopify-razorpay-backend-production.up.railway.app/webhooks/razorpay`
3. Enable events:
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.cancelled`
   - `subscription.halted`
   - `payment.authorized`
   - `payment.failed`

## Troubleshooting

### Common Issues

#### 1. Subscription Options Not Showing
- Check if product has `subscription` tag
- Verify template is assigned to product
- Check browser console for JavaScript errors

#### 2. Razorpay Not Loading
- Verify Razorpay key ID in theme settings
- Check if `subscription-product.js` is loading
- Verify API URL is correct

#### 3. Subscription Management Not Working
- Check if customer is logged in
- Verify page template is assigned correctly
- Check browser console for errors

#### 4. Webhook Issues
- Verify webhook URL is accessible
- Check webhook secret in backend
- Monitor Railway logs for webhook processing

### Debug Mode

To enable debug mode, add this to your theme settings:
```javascript
window.subscriptionConfig.debug = true;
```

This will log additional information to the browser console.

## Required Shopify Permissions

Make sure your Shopify app has these permissions:
- `read_products`
- `write_products`
- `read_orders`
- `write_orders`
- `read_customers`
- `write_customers`

## Mobile Responsiveness

All templates are mobile-responsive. Test on different screen sizes to ensure proper functionality.

## Performance Optimization

- CSS and JS files are minified by Shopify automatically
- Images are optimized through Shopify's CDN
- Consider lazy loading for product images

## Security Notes

- Never expose your Razorpay secret key in frontend code
- Use HTTPS for all API calls
- Validate all webhook signatures
- Implement rate limiting for API endpoints

## Support

If you encounter issues:
1. Check browser console for JavaScript errors
2. Verify all files are uploaded correctly
3. Check theme settings configuration
4. Monitor Railway backend logs
5. Test with different products and customers

Your Shopify subscription system is now ready! 🎉
