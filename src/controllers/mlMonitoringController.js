'use strict';

const predictionHistoryService = require('../services/predictionHistoryService');
const mlDriftService = require('../services/mlDriftService');

function sendValidationError(res, error) {
  if (error instanceof TypeError || error instanceof RangeError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

async function apiListMlPredictions(req, res) {
  try {
    const history = await predictionHistoryService.listPredictionHistory(
      req.query || {}
    );
    return res.json(history);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[apiListMlPredictions]', error);
    return res.status(500).json({ error: 'Failed to load prediction history.' });
  }
}

async function apiGetMlDrift(req, res) {
  try {
    const report = await mlDriftService.getDriftReport(req.query || {});
    if (report === null) {
      return res.status(404).json({ error: 'Model snapshot not found.' });
    }
    return res.json(report);
  } catch (error) {
    if (sendValidationError(res, error)) return;
    console.error('[apiGetMlDrift]', error);
    return res.status(500).json({ error: 'Failed to load model drift report.' });
  }
}

module.exports = {
  apiGetMlDrift,
  apiListMlPredictions,
};
