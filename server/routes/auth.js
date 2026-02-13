const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { userQueries, familyQueries } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const { jwtSecret, googleClientId } = require('../config/config');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, familyName } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = userQueries.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let familyId = null;

    // If familyName provided, create a new family
    if (familyName) {
      const familyResult = familyQueries.create(familyName, null);
      familyId = familyResult.lastInsertRowid;
    }

    // Create user
    const userResult = userQueries.create(email, passwordHash, name, familyId);
    const userId = userResult.lastInsertRowid;

    // If we created a family, set this user as the host
    if (familyId) {
      familyQueries.updateHost(userId, familyId);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: userId, email, name, familyId },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: userId, email, name, familyId }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = userQueries.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Guard: Google-only users can't use password login
    if (!user.password_hash) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Please use the Google button to log in.' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, familyId: user.family_id },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        familyId: user.family_id
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = userQueries.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        familyId: user.family_id,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// POST /api/auth/google - Google OAuth sign-in
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    if (!googleClientId) {
      return res.status(500).json({ error: 'Google OAuth is not configured on this server' });
    }

    // Verify the Google token
    const client = new OAuth2Client(googleClientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    // 1. Find user by google_id
    let user = userQueries.findByGoogleId(googleId);

    if (!user) {
      // 2. Find by email (link existing account)
      user = userQueries.findByEmail(email);
      if (user) {
        // Link Google ID to existing account
        userQueries.setGoogleId(googleId, user.id);
      } else {
        // 3. Create new user (no password)
        const result = userQueries.createGoogleUser(email, name || email.split('@')[0], googleId);
        user = userQueries.findById(result.lastInsertRowid);
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, familyId: user.family_id },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Google login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        familyId: user.family_id
      }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

module.exports = router;
