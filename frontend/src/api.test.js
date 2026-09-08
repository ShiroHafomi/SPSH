import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from './api.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('API error responses', () => {
  it('forwards GET and POST abort signals without swallowing cancellation', async () => {
    const controller = new AbortController();
    globalThis.fetch = async (url, options) => {
      assert.equal(options.signal, controller.signal);
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    };
    await api.get('/student/me/study-timers/current', { signal: controller.signal });
    await api.post('/student/me/study-timers', { title: 'Study' }, { signal: controller.signal });
    controller.abort();
    await assert.rejects(api.get('/student/me/study-timers/current', { signal: controller.signal }), { name: 'AbortError' });
    await assert.rejects(api.post('/student/me/study-timers', {}, { signal: controller.signal }), { name: 'AbortError' });
  });
  it('forwards PATCH and DELETE abort signals and preserves cookie authentication', async () => {
    const controller = new AbortController();
    globalThis.fetch = async (url, options) => {
      assert.equal(options.signal, controller.signal);
      assert.equal(options.credentials, 'include');
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    };
    await api.patch('/student/me/learning-journal/1', { version: 1 }, { signal: controller.signal });
    await api.delete('/student/me/learning-journal/1?version=1', { signal: controller.signal });
    controller.abort();
    await assert.rejects(api.patch('/student/me/learning-journal/1', {}, { signal: controller.signal }), { name: 'AbortError' });
    await assert.rejects(api.delete('/student/me/learning-journal/1?version=1', { signal: controller.signal }), { name: 'AbortError' });
  });
  it('posts intervention requests with cookie authentication and no identity payload', async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/admin/students/2/intervention');
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'include');
      assert.equal(options.body, undefined);
      return new Response(JSON.stringify({ interventionNote: 'Full note' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    assert.equal((await api.post('/admin/students/2/intervention')).interventionNote, 'Full note');
  });
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
