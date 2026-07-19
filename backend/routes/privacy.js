// backend/routes/privacy.js
// Settings → Privacy — currently just Online Status; more sections can land here
// the same way Settings → Notifications grew (see routes/notifications.js).

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Whitelisted so PUT /settings can't write arbitrary fields onto the user document.
const PRIVACY_PREF_KEYS = ['showOnlineStatus'];

// Get privacy settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('privacyPreferences');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ settings: user.privacyPreferences });

  } catch (error) {
    console.error('Get privacy settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update privacy settings
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    for (const key of PRIVACY_PREF_KEYS) {
      if (typeof req.body[key] === 'boolean') {
        user.privacyPreferences[key] = req.body[key];
      }
    }
    await user.save();

    res.json({ settings: user.privacyPreferences });

  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
