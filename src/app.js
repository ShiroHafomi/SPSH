/**
 * Express app factory — serves REST API + React frontend (Vite in dev, static build in prod).
 */
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const morgan = require('morgan');

const { ensureReady } = require('./config/db');
const authService = require('./services/authService');
const apiRoutes = require('./routes/apiRoutes');

const isDev = process.env.NODE_ENV !== 'production';
const frontendDevOrigin = 'http://localhost:5173';
const frontendDevOriginAlt = 'http://localhost:5174';
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
  app.use(cookieParser());

  // --- Current user middleware (JWT-based) ---
  const { verifyAccessToken, extractToken } = require('./utils/jwtUtils');
  app.use(async (req, res, next) => {
    const token = extractToken(req);
    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        const user = await authService.findById(decoded.id);
        if (user && user.is_active) {
          res.locals.currentUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            student_id: user.student_id,
            department: user.department,
          };
        } else {
          res.locals.currentUser = null;
        }
      } catch {
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
      const allowedDev = isDev ? [frontendDevOrigin, frontendDevOriginAlt] : [];
      if (origin && !origin.startsWith(allowed) && !allowedDev.includes(origin)) {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
      if (!origin && referer && !referer.startsWith(allowed) && !allowedDev.some(o => referer.startsWith(o))) {
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
          teacher: '/api/teacher/*',
          student: '/api/student/*',
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