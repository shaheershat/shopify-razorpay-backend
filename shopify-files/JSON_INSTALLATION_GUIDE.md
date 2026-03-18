# Shopify JSON Templates Installation Guide

## 🎯 **Modern Shopify Theme Files (JSON-Based)**

### 📁 **JSON Templates (2 files)**
1. **`templates/product.subscription.json`** - Product page template
2. **`templates/page.subscription-management.json`** - Page template

### 📁 **Sections (2 files)**
1. **`sections/main-product-subscription.liquid`** - Product section with subscription functionality
2. **`sections/main-subscription-management.liquid`** - Subscription management section

### 📁 **Assets (4 files)**
1. **`assets/subscription-product.css`** - Styles for product page
2. **`assets/subscription-product.js`** - JavaScript for product functionality
3. **`assets/subscription-management.js`** - JavaScript for management page
4. **`assets/subscription-management.css`** - Styles for management page

### 📁 **Config (1 file)**
1. **`config/settings_schema.json`** - Theme settings for subscription configuration

## 🚀 **Installation Steps**

### **Step 1: Add JSON Templates**

#### Product Template
1. Go to **Online Store** → **Themes** → **Edit code**
2. **Templates** → **Add a new template**
3. **Create template**: Choose **Product** → **JSON template**
4. **Template name**: `subscription`
5. **Paste content** from `templates/product.subscription.json`

#### Page Template
1. **Templates** → **Add a new template**
2. **Create template**: Choose **Page** → **JSON template**
3. **Template name**: `subscription-management`
4. **Paste content** from `templates/page.subscription-management.json`

### **Step 2: Add Sections**

#### Product Section
1. **Sections** → **Add a new section**
2. **Section name**: `main-product-subscription`
3. **Paste content** from `sections/main-product-subscription.liquid`

#### Management Section
1. **Sections** → **Add a new section**
2. **Section name**: `main-subscription-management`
3. **Paste content** from `sections/main-subscription-management.liquid`

### **Step 3: Add Assets**

#### CSS Files
1. **Assets** → **Add a new asset**
2. **Asset name**: `subscription-product.css`
3. **Paste CSS content**
4. Repeat for: `subscription-management.css`

#### JavaScript Files
1. **Assets** → **Add a new asset**
2. **Asset name**: `subscription-product.js`
3. **Paste JavaScript content**
4. Repeat for: `subscription-management.js`

### **Step 4: Update Theme Settings**

1. **Config** → **settings_schema.json**
2. **Add subscription settings** to your existing schema:
```json
{
  "name": "Subscription System",
  "settings": [
    {
      "type": "header",
      "content": "Razorpay Configuration"
    },
    {
      "type": "text",
      "id": "razorpay_key_id",
      "label": "Razorpay Key ID",
      "default": "rzp_live_SQfuiRsuG1eqca"
    },
    {
      "type": "text",
      "id": "subscription_api_url",
      "label": "Subscription API URL",
      "default": "https://shopify-razorpay-backend-production.up.railway.app"
    }
  ]
}
```

### **Step 5: Create Subscription Management Page**

1. **Online Store** → **Pages** → **Add page**
2. **Page title**: "Subscription Management"
3. **Template**: Choose `page.subscription-management`
4. **URL handle**: `subscription-management`
5. **Save**

### **Step 6: Configure Products**

#### Add Subscription Tag
1. **Products** → Select product
2. **Tags**: Add `subscription`
3. **Save**

#### Set Up Product Variants
1. **Add variants** for different subscription lengths:
   - "Monthly for 3 Months"
   - "Monthly for 6 Months"
   - "Monthly for 12 Months"

#### Add Metafields to Variants
1. **Settings** → **Metafields** → **Products**
2. Create these metafield definitions:
   - **Frequency**: `custom.frequency` (Single line text)
   - **Razorpay Plan ID**: `custom.razorpay_plan_id` (Single line text)
   - **Description**: `custom.description` (Single line text)

3. **Add metafield values** to each variant:
   ```
   Variant: "Monthly for 3 Months"
   custom.frequency: "3months"
   custom.razorpay_plan_id: "plan_SSBkeTxGhyv39t"
   custom.description: "Pay monthly for 3 months"
   ```

### **Step 7: Assign Templates to Products**

1. **Products** → Select subscription product
2. **Theme template**: Choose `product.subscription`
3. **Save**

### **Step 8: Configure Theme Settings**

1. **Online Store** → **Themes** → **Customize**
2. Look for **Subscription System** settings
3. Configure:
   - **Razorpay Key ID**: `rzp_live_SQfuiRsuG1eqca`
   - **API URL**: `https://shopify-razorpay-backend-production.up.railway.app`

## 🎨 **How JSON Templates Work**

### **Product Template Structure**
```json
{
  "sections": {
    "main": {
      "type": "main-product-subscription",
      "settings": { ... }
    }
  },
  "order": ["main"]
}
```

### **Section Structure**
```liquid
{% schema %}
{
  "name": "Subscription Product",
  "settings": [
    {
      "type": "checkbox",
      "id": "show_share_buttons",
      "label": "Show social sharing buttons",
      "default": true
    }
  ]
}
{% endschema %}
```

## 🔧 **Key Differences from Liquid Templates**

### **JSON Templates**
- ✅ **Modern approach** - Required for Shopify 2.0 themes
- ✅ **Section-based** - Modular and reusable
- ✅ **Drag-and-drop** - Easy customization in theme editor
- ✅ **Better performance** - Optimized loading

### **Liquid Templates (Legacy)**
- ❌ **Deprecated** - No longer recommended
- ❌ **Monolithic** - Harder to customize
- ❌ **Limited flexibility** - Fixed layout

## 📋 **Installation Checklist**

- [ ] Upload `templates/product.subscription.json`
- [ ] Upload `templates/page.subscription-management.json`
- [ ] Upload `sections/main-product-subscription.liquid`
- [ ] Upload `sections/main-subscription-management.liquid`
- [ ] Upload all 4 asset files
- [ ] Update theme settings schema
- [ ] Create subscription management page
- [ ] Configure product variants and metafields
- [ ] Add subscription tags to products
- [ ] Assign templates to products
- [ ] Test subscription flow

## 🎉 **Result**

Your Shopify store now has:
- ✅ **Modern JSON templates** (Shopify 2.0 compatible)
- ✅ **Section-based architecture** (easy customization)
- ✅ **Complete subscription system** (product + management)
- ✅ **Razorpay integration** (payment processing)
- ✅ **Mobile responsive** (works on all devices)

## 🛠️ **Troubleshooting**

### **Template Not Showing**
- Check if template is assigned to product
- Verify JSON syntax is correct
- Check theme editor for section availability

### **JavaScript Not Working**
- Verify asset files are uploaded
- Check browser console for errors
- Ensure Liquid variables are passing correctly

### **Metafields Not Displaying**
- Verify metafield definitions exist
- Check variant metafield values
- Ensure metafield namespace is correct

Your modern Shopify subscription system is ready! 🚀
