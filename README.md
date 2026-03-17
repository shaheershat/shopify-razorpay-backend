# Shopify-Razorpay Backend

A Node.js backend server to handle Razorpay subscriptions and Shopify integration.

## Features

- Create Razorpay subscriptions
- Handle Razorpay webhooks
- Manage subscriptions (pause, resume, cancel, skip)
- Shopify integration ready
- Health check endpoint

## API Endpoints

### Health Check
- `GET /health` - Check if server is running

### Subscription Management
- `POST /api/create-subscription` - Create new subscription
- `POST /api/subscriptions/pause` - Pause subscription
- `POST /api/subscriptions/resume` - Resume subscription
- `POST /api/subscriptions/skip` - Skip next payment
- `POST /api/subscriptions/cancel` - Cancel subscription

### Webhooks
- `POST /webhooks/razorpay` - Handle Razorpay webhook events

## Setup

1. Clone and install dependencies:
```bash
npm install
```

2. Create `.env` file with your credentials:
```env
# Razorpay
RAZORPAY_KEY_ID=rzp_test_abc123xyz456
RAZORPAY_SECRET_KEY=4RH9kB8xK2L9mN5pQ7r3tU8v
RAZORPAY_WEBHOOK_SECRET=webhook_secret_abc123xyz456

# Shopify
SHOPIFY_STORE_NAME=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token

# App
PORT=3000
NODE_ENV=development
```

3. Run locally:
```bash
npm run dev
```

## Heroku Deployment

### 1. Install Heroku CLI
```bash
# Mac
brew tap heroku/brew && brew install heroku

# Windows
# Download from: https://devcenter.heroku.com/articles/heroku-cli

# Linux
curl https://cli-assets.heroku.com/install.sh | sh
```

### 2. Login to Heroku
```bash
heroku login
```

### 3. Create Heroku App
```bash
heroku create your-app-name
```

### 4. Set Environment Variables
```bash
heroku config:set RAZORPAY_KEY_ID=your_key_id
heroku config:set RAZORPAY_SECRET_KEY=your_secret_key
heroku config:set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
heroku config:set SHOPIFY_STORE_NAME=your-store.myshopify.com
heroku config:set SHOPIFY_ACCESS_TOKEN=your_access_token
```

### 5. Deploy
```bash
git init
git add .
git commit -m "Initial commit"
heroku git:remote -a your-app-name
git push heroku main
```

### 6. Check Deployment
```bash
heroku logs --tail
```

Your app will be live at: `https://your-app-name.herokuapp.com`

## Testing

Test health check:
```bash
curl http://localhost:3000/health
```

## Webhook Configuration

Configure your Razorpay webhook URL to:
```
https://your-app-name.herokuapp.com/webhooks/razorpay
```

## Dependencies

- express - Web framework
- dotenv - Environment variables
- razorpay - Razorpay SDK
- cors - CORS middleware
- axios - HTTP client
- nodemon - Development server
