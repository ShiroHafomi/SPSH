/**
 * Express app factory — serves REST API + static SPA frontend.
 * No EJS, no server-side rendering. The frontend is a Vanilla JS SPA.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');

const { ensureReady } = require('./config/db');
const authService = require('./services/authService');
const apiRoutes = require('./routes/apiRoutes');

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

  // Static files (CSS, JS, images — served from /)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // --- Session middleware ---
  app.use(session({
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // --- Current user middleware ---
  // Populates res.locals.currentUser from session for API route use.
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

  // --- Minimal POST origin check (CSRF defense-in-depth) ---
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.get('Origin') || '';
      const referer = req.get('Referer') || '';
      const allowed = `http://localhost:${process.env.PORT || 3000}`;
      if (origin && !origin.startsWith(allowed)) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
      if (!origin && referer && !referer.startsWith(allowed)) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
    }
    next();
  });

  // --- API routes ---
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', apiRoutes);

  // --- SPA catch-all ---
  // Any non-API, non-static path serves index.html so the SPA handles routing.
  app.get('*', (req, res) => {
    // Don't catch /api/* routes (they should 404 as JSON)
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found.' });
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

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