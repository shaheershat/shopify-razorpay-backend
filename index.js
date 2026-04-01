// Railway deployment entry point
console.log('🚀 Starting Railway deployment...');

try {
  require('./server.js');
  console.log('✅ Server started successfully');
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}
