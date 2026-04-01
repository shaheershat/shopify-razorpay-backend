// Minimal Railway server
console.log('🚀 Railway server starting...');

try {
  // Load environment variables
  require('dotenv').config();
  
  // Basic Express setup
  const express = require('express');
  const app = express();
  
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
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'Backend is running!', timestamp: new Date().toISOString() });
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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Railway server running on port ${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
  });
  
} catch (error) {
  console.error('❌ Railway server failed:', error);
  process.exit(1);
}
