// backend/routes/rewards.js
// Milestone 9: Rewards Locker — read-only view of every badge a student can earn,
// cross-referenced against their real quiz history (QuizResult.awardsEarned /
// QuizResult.badge). No new game mechanic — this surfaces achievements already
// computed by quiz-socket-handlers.js's computeAwards()/assignBadge().

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const QuizResult = require('../models/QuizResult');
const { BADGE_CATALOG } = require('../badgeCatalog');
const { AVATAR_ITEM_CATALOG } = require('../avatarCatalog');

const isStudent = (req, res, next) => {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied. Student role required.' });
  }
  next();
};

// Milestone 12: every badge-gated cosmetic across every slot, cross-referenced
// against what's actually earned/already-seen — no separate unlock economy,
// this just walks the same catalog/badge data Milestone 10 already reads.
const findNewUnlocks = (user) => {
  const earnedBadges = new Set(user.avatar.badges || []);
  const seenUnlocks = new Set(user.avatar.seenUnlocks || []);
  const badgeBySlug = {};
  BADGE_CATALOG.forEach(b => { badgeBySlug[b.slug] = b; });

  const newUnlocks = [];
  for (const slot of Object.keys(AVATAR_ITEM_CATALOG)) {
    for (const item of AVATAR_ITEM_CATALOG[slot]) {
      if (!item.unlock || !item.unlock.badge) continue;
      if (!earnedBadges.has(item.unlock.badge)) continue;
      if (seenUnlocks.has(item.itemId)) continue;
      newUnlocks.push({
        slot,
        itemId: item.itemId,
        name: item.name,
        rarity: item.rarity,
        colors: item.colors,
        unlockedBy: badgeBySlug[item.unlock.badge] || null
      });
    }
  }
  return newUnlocks;
};

// ------------------
// GET /api/rewards/locker
// ------------------
router.get('/locker', authenticateToken, isStudent, async (req, res) => {
  try {
    const studentId = req.user._id;

    const awardCounts = await QuizResult.aggregate([
      { $match: { student: studentId } },
      { $unwind: '$awardsEarned' },
      { $group: { _id: '$awardsEarned', count: { $sum: 1 } } }
    ]);
    const countBySlug = {};
    awardCounts.forEach(a => { countBySlug[a._id] = a.count; });

    countBySlug.champion = await QuizResult.countDocuments({ student: studentId, badge: 'gold' });

    const badges = BADGE_CATALOG.map(b => {
      const count = countBySlug[b.slug] || 0;
      return { ...b, earned: count > 0, count };
    });

    res.json({
      badges,
      title: req.user.avatar.title,
      favoriteEmote: req.user.avatar.favoriteEmote,
      newUnlocks: findNewUnlocks(req.user)
    });
  } catch (err) {
    console.error('Get rewards locker error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// POST /api/rewards/acknowledge-unlocks
// Marks cosmetic unlocks as "seen" once their celebration animation has played,
// so the Locker doesn't replay the same unlock celebration on every reopen.
// ------------------
router.post('/acknowledge-unlocks', authenticateToken, isStudent, async (req, res) => {
  try {
    const { itemIds } = req.body || {};
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { 'avatar.seenUnlocks': { $each: itemIds } }
    });
    res.json({ message: 'Unlocks acknowledged' });
  } catch (err) {
    console.error('Acknowledge unlocks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
