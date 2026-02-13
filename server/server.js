const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initializeDatabase } = require('./models/database');
const { port, corsOrigin, nodeEnv } = require('./config/config');

// Import routes
const authRoutes = require('./routes/auth');
const eventsRoutes = require('./routes/events');
const familyRoutes = require('./routes/family');
const notificationRoutes = require('./routes/notifications');
const profileRoutes = require('./routes/profile');

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false
}));

// CORS
const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
app.use(cors({
  origin: nodeEnv === 'production'
    ? allowedOrigins
    : ['http://localhost:5173', 'http://127.0.0.1:5173', ...allowedOrigins],
  credentials: true
}));

app.use(express.json());

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);

// Serve uploaded photos
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/profile', profileRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React build in production
if (nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));

  // SPA fallback: all non-API routes serve index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function start() {
  await initializeDatabase();

  app.listen(port, () => {
    console.log(`Ancestry Atlas server running on http://localhost:${port}`);
    console.log(`Environment: ${nodeEnv}`);
  });
}

start().catch(console.error);
