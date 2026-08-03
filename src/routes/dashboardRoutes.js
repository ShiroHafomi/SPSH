/**
 * Dashboard Routes
 */
const express = require('express');
const { dashboard } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/', dashboard);

module.exports = router;