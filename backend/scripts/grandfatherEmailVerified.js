// backend/scripts/grandfatherEmailVerified.js
//
// Auth Spec v2 — ONE-TIME migration, not permanent boot logic. Phase 2 adds an
// emailVerified hard gate on login for authProvider:'email' users. Every account
// created before this migration defaults to emailVerified:false under the new
// schema (confirmed via direct DB query) and would be instantly locked out.
// This grandfathers every pre-existing user as verified exactly once. New
// signups going forward go through the real verification flow.
//
// Run manually: node scripts/grandfatherEmailVerified.js
// Safe to re-run — it's an idempotent bulk update (matches only emailVerified:false).

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  // $ne: true (not { emailVerified: false }) — existing documents predate this
  // field entirely, so it's literally MISSING in storage, not stored as false.
  // A plain { emailVerified: false } equality query does NOT match a missing
  // field in MongoDB, so it would silently grandfather zero users. $ne: true
  // matches missing, null, and false alike.
  const result = await User.updateMany(
    { emailVerified: { $ne: true } },
    { $set: { emailVerified: true } }
  );

  console.log(`Grandfathered ${result.modifiedCount} existing user(s) as emailVerified:true.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
