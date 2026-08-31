import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFlashInput } from './flash.js';

test('normalizeFlashInput preserves the message and explicit type call style', () => {
  assert.deepEqual(normalizeFlashInput('Saved', 'success'), {
    message: 'Saved',
    type: 'success',
  });
});

test('normalizeFlashInput supports the object call style used by admin pages', () => {
  assert.deepEqual(normalizeFlashInput({ message: 'Unable to load', type: 'error' }), {
    message: 'Unable to load',
    type: 'error',
  });
});

test('normalizeFlashInput never passes an arbitrary object to React as message content', () => {
  assert.deepEqual(normalizeFlashInput({ message: 404 }, 'warning'), {
    message: '404',
    type: 'warning',
  });
  assert.deepEqual(normalizeFlashInput(null, 'info'), {
    message: '',
    type: 'info',
  });
});
