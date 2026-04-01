// Minimal Railway server
console.log('🚀 Railway server starting...');
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
console.log('📦 PORT:', process.env.PORT || '3000');

try {
  // Load environment variables
  require('dotenv').config();
  
  // Basic Express setup
  const express = require('express');
  const app = express();
  
  console.log('✅ Express loaded successfully');
  
  app.use(express.json());
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  
  console.log('✅ Middleware configured');
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'Backend is running!', timestamp: new Date().toISOString() });
  });
  
  // Root endpoint for Railway
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Shopify Razorpay Backend - Railway Deployment',
      status: 'Running',
      endpoints: ['/health', '/api/create-mock-subscription'],
      timestamp: new Date().toISOString()
    });
  });
  
  // Mock subscription endpoint
  app.post('/api/create-mock-subscription', (req, res) => {
    res.json({
      success: true,
      subscription_id: 'sub_railway_' + Date.now(),
      message: 'Railway mock subscription created!',
      mock: true
    });
  });
  
  const PORT = process.env.PORT || 3000;
  
  console.log(`🚀 Starting Railway server on port ${PORT}...`);
  console.log(`🔗 Binding to 0.0.0.0:${PORT}`);
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Railway server running on port ${PORT}`);
    console.log(`🏥 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`🌍 External: http://localhost:${PORT}/health`);
    console.log(`🚀 Ready for Railway traffic!`);
  });
  
  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
    }
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ Railway server failed:', error);
  process.exit(1);
}
