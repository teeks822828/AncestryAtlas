const express = require('express');
const bcrypt = require('bcryptjs');
const { userQueries, familyQueries } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// GET /api/profile - Get profile info
router.get('/', (req, res) => {
  try {
    const user = userQueries.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let family = null;
    if (user.family_id) {
      family = familyQueries.findById(user.family_id);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        familyId: user.family_id,
        created_at: user.created_at
      },
      family
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PUT /api/profile/name - Update name
router.put('/name', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    userQueries.updateName(name.trim(), req.user.id);
    const user = userQueries.findById(req.user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        familyId: user.family_id,
        created_at: user.created_at
      },
      message: 'Name updated'
    });
  } catch (err) {
    console.error('Update name error:', err);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

// PUT /api/profile/password - Change password
router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const fullUser = userQueries.findByIdFull(req.user.id);
    if (!fullUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure password_hash is a string (sql.js may return Uint8Array)
    const storedHash = typeof fullUser.password_hash === 'string'
      ? fullUser.password_hash
      : new TextDecoder().decode(fullUser.password_hash);

    const isValid = await bcrypt.compare(currentPassword, storedHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    userQueries.updatePassword(hash, req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
