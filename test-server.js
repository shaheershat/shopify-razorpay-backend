// Minimal test server for Railway debugging
require('dotenv').config();

const express = require('express');
const app = express();

console.log('🚀 Starting minimal test server...');
console.log('📋 Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || '3000'
});

// Basic middleware
app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check hit');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Minimal server is working!'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  console.log('🏠 Root endpoint hit');
  res.json({
    message: 'Shopify Razorpay Backend - Minimal Test',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

console.log(`🚀 Starting server on port ${PORT}...`);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🏠 Root: http://localhost:${PORT}/`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('🎉 Server setup complete');
