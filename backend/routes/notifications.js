// backend/routes/notifications.js
// Notification management API

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Settings → Notifications (General) toggle keys — whitelisted so PUT /settings
// can't write arbitrary fields onto the user document.
const NOTIF_PREF_KEYS = ['notificationsEnabled', 'emailNotifications', 'pushNotifications', 'soundEnabled', 'previewEnabled'];

// ========================================
// MIDDLEWARE — Final audit: was a locally-duplicated JWT verifier, now the
// canonical authenticateToken imported above. Every handler in this file only
// ever reads req.userId, which the canonical middleware still sets identically.
// ========================================
// ROUTES
// ========================================

// Get my notifications
router.get('/my-notifications', authenticateToken, async (req, res) => {
  try {
    const { limit, unreadOnly } = req.query;
    
    let query = { recipient: req.userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    
    const notifications = await Notification.find(query)
      .populate('sender', 'name username')
      .populate('relatedGroup', 'groupName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 50);
    
    res.json({ notifications });
    
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await Notification.getUnreadCount(req.userId);
    res.json({ count });
    
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.recipient.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await notification.markAsRead();
    
    res.json({ message: 'Notification marked as read', notification });
    
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark all as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await Notification.markAllAsRead(req.userId);
    
    res.json({ message: 'All notifications marked as read' });
    
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Delete notification
router.delete('/:notificationId', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.recipient.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await notification.deleteOne();
    
    res.json({ message: 'Notification deleted' });
    
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Delete all read notifications
router.delete('/clear-read', authenticateToken, async (req, res) => {
  try {
    await Notification.deleteMany({
      recipient: req.userId,
      isRead: true
    });
    
    res.json({ message: 'Read notifications cleared' });
    
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Get notification settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('notificationPreferences');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ settings: user.notificationPreferences });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update notification settings
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    for (const key of NOTIF_PREF_KEYS) {
      if (typeof req.body[key] === 'boolean') {
        user.notificationPreferences[key] = req.body[key];
      }
    }
    await user.save();

    res.json({ settings: user.notificationPreferences });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;