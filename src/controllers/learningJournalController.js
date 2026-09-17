'use strict';
const service = require('../services/learningJournalService');
const { JournalError } = require('../utils/learningJournalValidation');
function handler(operation, status = 200) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { return res.status(status).json(await operation(req)); }
    catch (error) {
      if (error instanceof JournalError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[learningJournal] Operation failed.');
      return res.status(500).json({ error: 'Unable to process the journal request.', code: 'JOURNAL_INTERNAL_ERROR' });
    }
  };
}
module.exports = {
  list: handler(req => service.list(req.user, req.query)),
  get: handler(req => service.get(req.user, req.params.entryId)),
  create: handler(req => service.create(req.user, req.body), 201),
  update: handler(req => service.update(req.user, req.params.entryId, req.body)),
  remove: handler(req => service.remove(req.user, req.params.entryId, req.query)),
};
