export function createDashboardResource(load) {
  let state = { data: null, loading: true, error: false };
  let active = false;
  let generation = 0;
  let pending = null;
  const listeners = new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  function refresh() {
    if (!active) return Promise.resolve();
    if (pending) return pending.promise;
    const request = { generation, controller: new AbortController() };
    pending = request;
    publish({ loading: true, error: false });
    const current = () => active && generation === request.generation && pending === request;
    // Defer transport until StrictMode's mount/cleanup replay has finished.
    request.promise = Promise.resolve().then(async () => {
      if (!current()) return;
      try {
        const data = await load(request.controller.signal);
        if (current()) publish({ data, error: false });
      } catch (error) {
        if (current()) publish({ error: error?.status || true });
      } finally {
        if (current()) {
          pending = null;
          publish({ loading: false });
        }
      }
    });
    return request.promise;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    resume() {
      active = true;
      return refresh();
    },
    dispose() {
      active = false;
      generation += 1;
      pending?.controller.abort();
      pending = null;
    },
  };
}
