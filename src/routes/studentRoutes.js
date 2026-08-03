/**
 * Student Routes — Full CRUD
 */
const express = require('express');
const {
  index,
  newForm,
  create,
  editForm,
  update,
  remove,
} = require('../controllers/studentController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All student routes require authentication
router.use(requireAuth);

// List + search/sort/paginate
router.get('/', index);

// Create
router.get('/new', newForm);
router.post('/', create);

// Edit
router.get('/:id/edit', editForm);
router.post('/:id', update);

// Delete
router.post('/:id/delete', remove);

module.exports = router;