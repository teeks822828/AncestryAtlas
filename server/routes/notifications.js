const express = require('express');
const { notificationQueries } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// GET /api/notifications - Get user's notifications
router.get('/', (req, res) => {
  try {
    const notifications = notificationQueries.getAll(req.user.id);
    const unreadCount = notificationQueries.getUnread(req.user.id).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// POST /api/notifications/:id/read - Mark notification as read
router.post('/:id/read', (req, res) => {
  try {
    const notifId = parseInt(req.params.id);
    notificationQueries.markRead(notifId);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications/read-all - Mark all as read
router.post('/read-all', (req, res) => {
  try {
    notificationQueries.markAllRead(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

module.exports = router;
