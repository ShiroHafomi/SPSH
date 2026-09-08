'use strict';

const service = require('../services/studyTimerService');
const { StudyTimerError } = require('../utils/studyTimerValidation');
function handler(operation, status = 200) {
  return async (req, res) => {
    try {
      const result = await operation(req);
      res.set('Cache-Control', 'no-store');
      return res.status(status).json(result);
    } catch (error) {
      if (error instanceof StudyTimerError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[studyTimer] Operation failed.');
      return res.status(500).json({ error: 'Failed to process study timer.', code: 'STUDY_TIMER_INTERNAL_ERROR' });
    }
  };
}
module.exports = {
  current: handler(req => service.current(req.user)),
  start: handler(req => service.start(req.user, req.body), 201),
  history: handler(req => service.history(req.user, req.query)),
  summary: handler(req => service.summary(req.user, req.query)),
  ...Object.fromEntries(['pause', 'resume', 'finish', 'discard'].map(action => [action,
    handler(req => service.transition(req.user, req.params.sessionId, action, req.body))])),
};
