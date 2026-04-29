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
