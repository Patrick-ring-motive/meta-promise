/**
 * Unified Exposed Proxy Promise
 * * Combines the state management of ExposedPromise with the deep-proxying
 * capabilities of wrapPromise.
 * * Features:
 * - State tracking (.status, .value, .settled)
 * - External control (.resolve(), .reject())
 * - Fluent Deferred Access: Access properties or call methods on the 
 * eventual result as if they were already there.
 * - Synchronous shortcuts: Returns settled values immediately if available.
 */

class ExposedPromise {
  constructor(executor) {
    this.status = "pending";
    this.value = undefined;
    this.executor = executor ?? null;

    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      if (executor) {
        try {
          executor(resolve, reject);
        } catch (err) {
          reject(err);
        }
      }
    });

    // Tracking branch for internal state
    this.promise.then(
      (value) => {
        this.status = "fulfilled";
        this.value = value;
      },
      (reason) => {
        this.status = "rejected";
        this.value = reason;
      }
    ).catch(() => {}); 
  }

  get settled() {
    return this.status !== "pending";
  }

  // Standard Promise methods
  then(onFulfilled, onRejected) {
    return this.promise.then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.promise.catch(onRejected);
  }

  finally(onFinally) {
    return this.promise.finally(onFinally);
  }
}

/**
 * Creates a Proxy around an ExposedPromise (or standard Promise) that allows
 * for fluent, chainable property access and method calls on the future value.
 */
function createExposedProxy(input) {
  // If input is an executor function or null, create a new ExposedPromise
  // If it's already an ExposedPromise or standard Promise, use it.
  const instance = (typeof input === 'function' || input === undefined) 
    ? new ExposedPromise(input) 
    : input;

  // The underlying promise we are proxying
  const p = instance.promise || instance;

  // A dummy function target allows the proxy to be "callable" and "constructable"
  const dummyTarget = function() {};

  return new Proxy(dummyTarget, {
    get(_, prop) {
      // 1. Prioritize internal ExposedPromise state/methods if they exist
      if (instance instanceof ExposedPromise) {
        if (prop === 'status') return instance.status;
        if (prop === 'value') return instance.value;
        if (prop === 'settled') return instance.settled;
        if (prop === 'resolve') return instance.resolve.bind(instance);
        if (prop === 'reject') return instance.reject.bind(instance);
        if (prop === 'promise') return instance.promise;

        // NEW: Synchronous Shortcut
        // If the promise is fulfilled, we can try to return the property immediately
        if (instance.status === 'fulfilled' && instance.value !== null && typeof instance.value === 'object') {
          const val = instance.value[prop];
          // If it's a standard property (not a function that needs binding), return it.
          // Note: We don't return functions immediately because they might need 
          // to be chainable proxies themselves if they return promises.
          if (val !== undefined && typeof val !== 'function') {
            return val;
          }
        }
      }

      // 2. Standard Promise method binding
      if (prop === 'then') return p.then.bind(p);
      if (prop === 'catch') return p.catch.bind(p);
      if (prop === 'finally') return p.finally.bind(p);

      // 3. Deferred property access
      const deferred = p.then(resolved => {
        if (resolved == null) return undefined;
        const val = resolved[prop];
        return typeof val === 'function' ? val.bind(resolved) : val;
      });

      return createExposedProxy(deferred);
    },

    set(_, prop, value) {
      // If already fulfilled, we can update synchronously for immediate reflection
      if (instance instanceof ExposedPromise && instance.status === 'fulfilled') {
        if (instance.value != null && typeof instance.value === 'object') {
          instance.value[prop] = value;
        }
      }
      
      // Still perform the async set to maintain consistency with the promise chain
      p.then(resolved => {
        if (resolved != null && typeof resolved === 'object') {
          resolved[prop] = value;
        }
      }).catch(err => {
        console.error(`ExposedProxy: set "${String(prop)}" failed`, err);
      });
      return true;
    },

    apply(_, thisArg, args) {
      const deferred = p.then(fn => {
        if (typeof fn !== 'function') throw new TypeError('Target is not a function');
        return Reflect.apply(fn, fn, args);
      });
      return createExposedProxy(deferred);
    },

    construct(_, args) {
      const deferred = p.then(Ctor => {
        if (typeof Ctor !== 'function') throw new TypeError('Target is not a constructor');
        return Reflect.construct(Ctor, args);
      });
      return createExposedProxy(deferred);
    }
  });
}

export { ExposedPromise, createExposedProxy };
