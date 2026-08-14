/**
 * Express app factory — serves REST API + React frontend (Vite in dev, static build in prod).
 */
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');

const apiRoutes = require('./routes/apiRoutes');
const {
  createRequestProvenanceMiddleware,
  createSecurityConfig,
} = require('./config/security');

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');

function createApp() {
  const app = express();
  const security = createSecurityConfig();
  const isDev = !security.isProduction;

  // --- Global locals ---
  app.locals.appName = 'Student Performance & Study Habits';
  app.locals.dbReady = false;

  // --- Proxy and browser security ---
  if (security.trustProxy !== false) {
    app.set('trust proxy', security.trustProxy);
  }
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        upgradeInsecureRequests: security.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: security.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use((req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    next();
  });

  // --- Middleware ---
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(security.isProduction ? 'combined' : 'dev'));
  }
  app.use(express.urlencoded({
    extended: false,
    limit: security.urlencodedBodyLimit,
    parameterLimit: security.urlencodedParameterLimit,
  }));
  app.use(express.json({ limit: security.jsonBodyLimit }));
  app.use(cookieParser());

  // --- Cookie-authenticated request provenance / CSRF defense ---
  app.use(createRequestProvenanceMiddleware(security));

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

  // --- Error handling ---
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' });
    }

    console.error('[ERROR]', err);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal server error.' });
    }
    return res.status(500).send('Internal server error');
  });

  return app;
}

module.exports = { createApp };