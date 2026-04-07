#!/usr/bin/env node
// server/scripts/db-migrate.js
// Ensures all indexes are created on all models.

'use strict';

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emproiumvipani';

// Load all models so Mongoose registers their schemas and indexes
require('../models/User');
require('../models/Product');
require('../models/Order');
require('../models/OtpToken');
require('../models/Settlement');
require('../models/SupportTicket');
require('../models/GeneratedDocument');

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);
  console.log('\n🔧 Ensuring indexes on all models...\n');

  const modelNames = mongoose.modelNames();
  for (const modelName of modelNames) {
    const model = mongoose.model(modelName);
    await model.createIndexes();
    console.log(`  ✅ Indexes ensured: ${modelName}`);
  }

  console.log('\n✅ Migration complete — all indexes are up to date.\n');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
