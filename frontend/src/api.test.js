import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from './api.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('API error responses', () => {
  it('retains structured conflict data for safe client recovery', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: 'This assignment was changed elsewhere.',
      code: 'ASSIGNMENT_VERSION_CONFLICT',
      assignment: { id: 11, version: 4 },
    }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });

    await assert.rejects(
      api.patch('/student/me/assignments/11', { title: 'Updated', version: 3 }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 409);
        assert.equal(error.data.code, 'ASSIGNMENT_VERSION_CONFLICT');
        assert.equal(error.data.assignment.version, 4);
        return true;
      }
    );
  });
});
