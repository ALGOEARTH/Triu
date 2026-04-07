#!/usr/bin/env node
// server/scripts/db-reset.js
// Drops all collections and re-runs the seed script.
// USE WITH CAUTION — all data will be lost.

'use strict';

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { spawnSync } = require('child_process');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emproiumvipani';
const SEED_SCRIPT = path.join(__dirname, 'db-seed.js');

async function reset() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  if (collections.length === 0) {
    console.log('ℹ️  No collections found — nothing to drop.');
  } else {
    for (const col of collections) {
      await db.dropCollection(col.name);
      console.log(`  🗑️  Dropped collection: ${col.name}`);
    }
    console.log(`\n✅ Dropped ${collections.length} collection(s).`);
  }

  await mongoose.disconnect();

  console.log('\n🌱 Re-running seed script...\n');
  const result = spawnSync(process.execPath, [SEED_SCRIPT], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('❌ Seed script exited with code', result.status);
    process.exit(result.status || 1);
  }
}

reset().catch(err => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
