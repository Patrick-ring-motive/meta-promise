// ── Universal promise proxy ───────────────────────────────────────────────
function wrapPromise(promise) {
  const dummyTarget = function() {};

  return new Proxy(dummyTarget, {
    get(_, prop) {
      if (prop === 'then') return promise.then.bind(promise);
      if (prop === 'catch') return promise.catch.bind(promise);
      if (prop === 'finally') return promise.finally.bind(promise);

      const deferred = promise.then(resolved => {
        if (resolved == null) return undefined;
        const value = resolved[prop];
        return typeof value === 'function' ? value.bind(resolved) : value;
      });
      return wrapPromise(deferred);
    },

    set(_, prop, value) {
      promise.then(resolved => {
        if (resolved != null && typeof resolved === 'object') resolved[prop] = value;
      }).catch(err => console.error(`wrapPromise: set "${String(prop)}" failed`, err));
      return true;
    },

    apply(_, thisArg, args) {
      return wrapPromise(promise.then(fn => {
        if (typeof fn !== 'function') throw new TypeError('Target is not a function');
        return Reflect.apply(fn, fn, args);
      }));
    },

    construct(_, args) {
      return wrapPromise(promise.then(Ctor => {
        if (typeof Ctor !== 'function') throw new TypeError('Target is not a constructor');
        return Reflect.construct(Ctor, args);
      }));
    }
  });
}
