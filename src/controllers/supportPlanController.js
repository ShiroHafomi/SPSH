'use strict';

const service = require('../services/supportPlanService');
const { SupportPlanError } = require('../utils/supportPlanValidation');

function handler(operation, status = 200) {
  return async (req, res) => {
    try {
      const result = await operation(req);
      return res.status(status).json(result);
    } catch (error) {
      if (error instanceof SupportPlanError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[supportPlan] Operation failed.');
      return res.status(500).json({ error: 'Failed to process support plan.', code: 'SUPPORT_PLAN_INTERNAL_ERROR' });
    }
  };
}

module.exports = {
  list: handler(req => service.listPlans(req.user, req.params.studentId, req.query)),
  get: handler(async req => ({ plan: await service.getPlan(req.user, req.params.studentId, req.params.planId) })),
  create: handler(req => service.createPlan(req.user, req.params.studentId, req.body), 201),
  edit: handler(req => service.editPlan(req.user, req.params.studentId, req.params.planId, req.body)),
  activate: handler(req => service.transitionPlan(req.user, req.params.studentId, req.params.planId, 'activate', req.body)),
  complete: handler(req => service.transitionPlan(req.user, req.params.studentId, req.params.planId, 'complete', req.body)),
  cancel: handler(req => service.transitionPlan(req.user, req.params.studentId, req.params.planId, 'cancel', req.body)),
  updateTask: handler(req => service.updateTask(req.user, req.params.studentId, req.params.planId, req.params.taskId, req.body)),
};
