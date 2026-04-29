/**
 * Wraps a function or a promise-to-function, allowing async function resolution 
 * to be transparent to the caller. Enables: 
 *   - Direct calls: fn(arg) 
 *   - Promise-style handling: fn.then(...), fn.catch(...)
 * 
 * Why? To treat locally defined and remotely resolved (e.g., via Worker, fetch) 
 * functions with the same interface — eliminating boilerplate around await 
 * or .then() when the function's origin is async.
 */

function normalizeFunctionOrPromise(fnOrPromise) {
  if (typeof fnOrPromise === 'function') {
    return fnOrPromise;
  }

  if (fnOrPromise && typeof fnOrPromise.then === 'function') {
    // Return callable that also has promise interface
    const wrapper = function (...args) {
      return fnOrPromise.then(fn => {
        if (typeof fn !== 'function') {
          throw new TypeError('Promise did not resolve to a function');
        }
        return fn.apply(this, args);
      });
    };

    // Forward promise methods
    wrapper.then = fnOrPromise.then.bind(fnOrPromise);
    wrapper.catch = fnOrPromise.catch.bind(fnOrPromise);
    wrapper.finally = fnOrPromise.finally.bind(fnOrPromise);

    return wrapper;
  }

  throw new TypeError('Input must be a function or a Promise resolving to a function');
}

class PromiseFunction extends Function {
  constructor(fnOrPromise) {
    const normalized = normalizeFunctionOrPromise(fnOrPromise);
    
    // Create callable that inherits from PromiseFunction.prototype
    const instance = new Proxy(normalized, {
      get(target, prop, receiver) {
        // Check prototype chain first
        if (prop in PromiseFunction.prototype) {
          return PromiseFunction.prototype[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
      getPrototypeOf() {
        return PromiseFunction.prototype;
      }
    });

    return instance;
  }
}

// Fix prototype chain
Object.setPrototypeOf(PromiseFunction.prototype, Function.prototype);
