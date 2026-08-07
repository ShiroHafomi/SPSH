/**
 * Express app factory — serves REST API + React frontend (Vite in dev, static build in prod).
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

const { ensureReady } = require('./config/db');
const authService = require('./services/authService');
const apiRoutes = require('./routes/apiRoutes');

const isDev = process.env.NODE_ENV !== 'production';
const frontendDevOrigin = 'http://localhost:5173';
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');

function createApp() {
  const app = express();

  // --- Global locals ---
  app.locals.appName = 'Student Performance & Study Habits';
  app.locals.dbReady = false;

  // --- Middleware ---
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // --- Session middleware ---
  app.use(session({
    name: 'spsh.sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // Changed from 'strict' to allow cross-origin via Vite proxy
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // --- Current user middleware ---
  app.use(async (req, res, next) => {
    if (req.session && req.session.userId) {
      try {
        const user = await authService.findById(req.session.userId);
        res.locals.currentUser = user;
      } catch {
        req.session.destroy(() => {});
        res.locals.currentUser = null;
      }
    } else {
      res.locals.currentUser = null;
    }
    next();
  });

  // --- CSRF defense-in-depth ---
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.get('Origin') || '';
      const referer = req.get('Referer') || '';
      const allowed = `http://localhost:${process.env.PORT || 3000}`;
      // In development, also allow Vite dev server origin
      const allowedDev = isDev ? frontendDevOrigin : '';
      if (origin && !origin.startsWith(allowed) && origin !== allowedDev) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
      if (!origin && referer && !referer.startsWith(allowed) && !referer.startsWith(allowedDev)) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
    }
    next();
  });

  // --- API routes ---
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', apiRoutes);

  // --- Frontend serving ---
  if (isDev) {
    // In development, Vite dev server handles frontend (port 5173)
    // Express only serves API. Add a helpful message for root access.
    app.get('/', (req, res) => {
      res.json({
        message: 'Student Performance API running',
        frontend: 'Run "npm run dev" in frontend/ to start Vite dev server on port 5173',
        endpoints: {
          health: '/health',
          auth: '/api/auth/*',
          students: '/api/students*',
          dashboard: '/api/dashboard/*',
          admin: '/api/admin/*',
        },
      });
    });
  } else {
    // Production: serve built React app
    app.use(express.static(frontendDist));

    // SPA catch-all for client-side routing
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // --- 500 ---
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal server error.' });
    }
    res.status(500).send('Internal server error');
  });

  return app;
}

module.exports = { createApp };