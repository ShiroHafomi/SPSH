/**
 * Express app factory. No listening — just wiring.
 * All routes are mounted here so tests can import and use supertest.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const ejs = require('ejs');
const expressLayouts = require('express-ejs-layouts');

const { pool, ensureReady } = require('./config/db');
const studentRoutes = require('./routes/studentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

function createApp() {
  const app = express();

  // --- Settings ---
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('layout', 'layouts/main');
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', true);

  // --- Global locals (available in every view) ---
  app.locals.appName = 'Student Performance & Study Habits';
  app.locals.dbReady = false;  // will be set by ensureReady at boot

  // --- Middleware ---
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(expressLayouts);

  // --- Helper: set dbReady on first request that hits the pool ---
  // (Actual boot-time check happens in server.js before listen)
  let readyChecked = false;
  app.use(async (req, res, next) => {
    if (!readyChecked) {
      app.locals.dbReady = await ensureReady();
      readyChecked = true;
    }
    next();
  });

  // --- Flash from querystring ---
  // Reads ?created=1, ?updated=1, ?deleted=1, ?error=message and
  // sets res.locals.flash so the flash.ejs partial renders.
  app.use((req, res, next) => {
    const flash = {};
    const q = req.query;
    if (q.created === '1') flash.created = true;
    if (q.updated === '1') flash.updated = true;
    if (q.deleted === '1') flash.deleted = true;
    if (q.error) flash.error = q.error;
    if (q.success) flash.success = q.success;
    res.locals.flash = flash;
    next();
  });

  // --- Minimal POST origin check (CSRF defense-in-depth) ---
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.get('Origin') || '';
      const referer = req.get('Referer') || '';
      const allowed = `http://localhost:${process.env.PORT || 3000}`;
      if (origin && !origin.startsWith(allowed)) {
        return res.status(403).render('error', {
          title: 'Forbidden',
          message: 'Cross-origin requests are not allowed.',
          backLink: '/',
        });
      }
      if (!origin && referer && !referer.startsWith(allowed)) {
        return res.status(403).render('error', {
          title: 'Forbidden',
          message: 'Cross-origin requests are not allowed.',
          backLink: '/',
        });
      }
    }
    next();
  });

  // --- Routes ---
  app.get('/health', (req, res) => res.json({ ok: true }));

  // Dashboard (home)
  app.use('/', dashboardRoutes);

  // Students CRUD
  app.use('/students', studentRoutes);

  // --- 404 ---
  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Not Found',
      message: `Cannot ${req.method} ${req.path}`,
      backLink: '/',
    });
  });

  // --- 500 ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;
    res.status(500).render('error', {
      title: 'Server Error',
      message,
      backLink: '/',
    });
  });

  return app;
}

module.exports = { createApp };