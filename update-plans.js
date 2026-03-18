const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY
});

async function updatePlans() {
  try {
    console.log('🔄 Updating Razorpay plans with higher amounts...');

    // Create new plans with higher amounts (since edit might not work)
    
    // 3-month plan to ₹500 (50000 paise)
    const plan3Months = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'Pay monthly for 3 months',
        amount: 50000, // ₹500.00 in paise
        currency: 'INR',
        description: 'Monthly subscription for 3 months'
      },
      notes: {
        frequency: '3',
        product_title: 'Monthly for 3 Months'
      }
    });
    console.log('✅ Created new 3-month plan:', plan3Months.id);

    // 6-month plan to ₹800 (80000 paise)
    const plan6Months = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'Pay monthly for 6 months',
        amount: 80000, // ₹800.00 in paise
        currency: 'INR',
        description: 'Monthly subscription for 6 months'
      },
      notes: {
        frequency: '6',
        product_title: 'Monthly for 6 Months'
      }
    });
    console.log('✅ Created new 6-month plan:', plan6Months.id);

    // 12-month plan to ₹1200 (120000 paise)
    const plan12Months = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: 'Pay monthly for 12 months',
        amount: 120000, // ₹1200.00 in paise
        currency: 'INR',
        description: 'Monthly subscription for 12 months'
      },
      notes: {
        frequency: '12',
        product_title: 'Monthly for 12 Months'
      }
    });
    console.log('✅ Created new 12-month plan:', plan12Months.id);

    console.log('🎉 All new plans created successfully!');
    console.log('\n📋 New Plan IDs:');
    console.log('3-month:', plan3Months.id);
    console.log('6-month:', plan6Months.id);
    console.log('12-month:', plan12Months.id);
    
    console.log('\n⚠️ UPDATE your frontend to use these new plan IDs!');

  } catch (error) {
    console.error('❌ Error creating plans:', error);
  }
}

updatePlans();
