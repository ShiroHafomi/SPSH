/**
 * Dashboard Routes
 */
const express = require('express');
const { dashboard } = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, dashboard);

module.exports = router;