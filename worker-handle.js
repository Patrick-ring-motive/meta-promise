function isClass(fn) {
  if (typeof fn !== "function") return false;
  const src = Function.prototype.toString.call(fn);
  return /^class\s/.test(src);
}

function isConstructor(fn) {
  try {
    Reflect.construct(String, [], fn);
    return true;
  } catch {
    return false;
  }
}

function callableClass($class){
  const handler = {
    apply(target, thisArg, args) {
      return Reflect.construct(target, args, thisArg);
    }
  };
  return new Proxy($class, handler);
}

function createConstructable(fn){
  const handler = {
    construct(target, args, newTarget) {
      return Reflect.apply(target, newTarget, args);
    }
  };
  return new Proxy(fn, handler);
}

function createCallable($target,fn) {
  if(typeof $target === 'function'){
    if(isClass($target)){
      return callableClass($target);
    }
    if(!isConstructor($target)){
      return createConstructable($target);
    }
    return $target;
  }
  fn ??= (function(){return $target}).bind($target);
  const handler = {
    getPrototypeOf(target) {
      return Reflect.getPrototypeOf($target);
    },

    setPrototypeOf(target, prototype) {
      return Reflect.setPrototypeOf($target, prototype);
    },

    isExtensible(target) {
      return Reflect.isExtensible($target);
    },

    preventExtensions(target) {
      return Reflect.preventExtensions($target);
    },

    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor($target, prop);
    },

    defineProperty(target, prop, descriptor) {
      return Reflect.defineProperty($target, prop, descriptor);
    },

    has(target, prop) {
      return Reflect.has($target, prop);
    },

    get(target, prop, receiver) {
      const value = Reflect.get($target, prop, receiver);
      if(typeof value === 'function'){
        return value.bind($target);
      }
      return value;
    },

    set(target, prop, value, receiver) {
      return Reflect.set($target, prop, value, receiver);
    },

    deleteProperty(target, prop) {
      return Reflect.deleteProperty($target, prop);
    },

    ownKeys(target) {
      return Reflect.ownKeys($target);
    },

    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args);
    },

    construct(target, args, newTarget) {
      return Reflect.construct(target, args, newTarget);
    }
  };
  return new Proxy(fn, handler);
}

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
function promiseFunction(fnOrPromise) {
  if (typeof fnOrPromise !== 'function' && typeof fnOrPromise?.then === 'function') {
    const promise = fnOrPromise;
    const promiseFn = async function $promiseFn(...args) {
      const fn = await promise;
      if (typeof fn !== 'function') {
        // intentionally trigger internal throw behavior
        return fn(...args);
      }
      return fn.apply(this, args);
    };
    return createCallable(promise,promiseFn);
  }
  return fnOrPromise;
}

class $PromiseFunction extends Function {}

const PromiseFunction = new Proxy($PromiseFunction, {
  construct(target, args, receiver){
    const $this = receiver ?? target;
    return promiseFunction(args[0]);
  },
  apply(target, thisArg, args) {
    return promiseFunction(args[0]);
  }
});

const obj = x =>{
  if(x === undefined || x === null){
    return Object.create(null);
  }
  return Object(x);
};

function MetaProxy(target, handler){
    const $target = target = obj(target);
    const $handler = handler = obj(handler);
    if(handler.apply || handler.construct){
      if(typeof target.then === 'function' && typeof target !== 'function'){
        target = promiseFunction(target);
      }else{
        target = createCallable(target);
      }
    }
    const $this = {};
    $this.proxy = new Proxy(target, handler);
    $this.target = $target;
    $this.handler = $handler;
    return $this;
}

function findSymbol(target,prop){
  const list = Object.getOwnPropertySymbols(target);
  for(const key of list){
    try{
      if(key == prop){
        return target[key];
      }
    }catch{}
  }
  prop = String(prop);
  for(const key of list){
    try{
      if(String(key) == prop){
        return target[key];
      }
    }catch{}
  }
  for(const key of list){
    try{
      if(key.description == prop){
        return target[key];
      }
    }catch{}
  }
}



const TRANSACTION = Symbol("transaction");

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

    this.promise
      .then(
        (val) => {
          this.status = "fulfilled";
          this.value = val;
        },
        (err) => {
          this.status = "rejected";
          this.value = err;
        },
      )
      .catch(() => {});
  }

  get settled() {
    return this.status !== "pending";
  }
  then(fn, err) {
    return this.promise.then(fn, err);
  }
  catch(err) {
    return this.promise.catch(err);
  }
  finally(fn) {
    return this.promise.finally(fn);
  }
}

function createExposedProxy(input, path = []) {
  const instance =
    typeof input === "function" ||
    (typeof input === "object" && input !== null && "promise" in input)
      ? input
      : new ExposedPromise((resolve) => resolve(input));

  const $promise = instance.promise || instance;

  // Use a function as target so the Proxy is "callable"
  const dummyTarget = function () {};

  return new Proxy(dummyTarget, {
    get(_, prop) {
      // 1. Internal Metadata Access
      if (instance instanceof ExposedPromise) {
        if (prop === "status") return instance.status;
        if (prop === "value") return instance.value;
        if (prop === "settled") return instance.settled;
        if (prop === "resolve") return instance.resolve.bind(instance);
        if (prop === "reject") return instance.reject.bind(instance);
        if (prop === "promise") return instance.promise;
      }

      // 2. Promise standard methods
      if (prop === "then") return $promise.then.bind($promise);
      if (prop === "catch") return $promise.catch.bind($promise);
      if (prop === "finally") return $promise.finally.bind($promise);
      if (typeof prop === "symbol") return undefined;
      console.log({$promise});
      // 3. Deferred property access
      const deferred = $promise.then((resolved) => {
        console.log({resolved});
        if (resolved == null) return undefined;

        // If we have a WorkerWrapper, we check if the property exists locally
        if (resolved instanceof _WorkerWrapper) {
          if (prop in resolved) {
            const val = resolved[prop];
            return typeof val === "function" ? val.bind(resolved) : val;
          }

          /**
           * To support both properties and methods:
           * We return a specialized proxy that acts as a "Caller".
           * If called as a function (apply), it triggers CALL_REMOTE.
           * If awaited (then), it triggers GET_PROP.
           */
          const caller = (...args) =>
            resolved.send("CALL_REMOTE", { prop, args });
          const remoteValue = resolved.send("GET_PROP", { prop });

          return new Proxy(caller, {
            get(t, p) {
              if (p === "then") return remoteValue.then.bind(remoteValue);
              if (p === "catch") return remoteValue.catch.bind(remoteValue);
              return createExposedProxy(remoteValue)[p];
            },
          });
        }

        const val = resolved[prop];
        return typeof val === "function" ? val.bind(resolved) : val;
      });

      return createExposedProxy(deferred, [...path, prop]);
    },

    set(_, prop, val) {
      $promise
        .then((res) => {
          if (res != null && typeof res === "object") {
            if (res instanceof _WorkerWrapper && !(prop in res)) {
              res.send("SET_PROP", { prop, val });
            } else {
              res[prop] = val;
            }
          }
        })
        .catch(() => {});
      return true;
    },

    // Handle the function call: worker.someMethod(args)
    apply(_, thisArg, args) {
      return createExposedProxy(
        PromiseFunction($promise)(...args)
      );
    },
  });
}

const genId = () =>
  `worker-tx-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;

class _WorkerWrapper {
  constructor(url, options) {
    this.transactions = new Map();
    this._ready = new ExposedPromise();

    try {
      this._worker = new Worker(url, options);
    } catch (err) {
      this._ready.reject(err);
      return;
    }

    this._worker.onmessage = (event) => {
      if (!event.data || typeof event.data !== "object") return;
      let { type, id, result, error } = event.data;

      if (type === "ready") {
        this._ready.resolve(this);
        return;
      }

      if (id && this.transactions.has(id)) {
        const trans = this.transactions.get(id);
        this.transactions.delete(id);
        if (error){
            trans.reject(new Error(error));
        }else{
            if (result?.__type === "function") {
              result = PromiseFunction(
                Promise.resolve((...args) =>
                  this.send("CALL_REMOTE", {
                    prop: result.prop,
                    args
                  })
                )
              );
            }
            if(result && /object|function/.test(typeof result)){
                result._workerWrapper = this; 
            }
            trans.resolve(result);
        }
      }
    };

    this._worker.onerror = (e) => this._rejectAll(e);
  }

  send(type, data, transfer) {
    const id = genId();
    const deferred = new ExposedPromise();
    this.transactions.set(id, deferred);
    this._worker.postMessage({ type, id, ...data }, transfer ?? []);
    return deferred.promise;
  }

  _rejectAll(reason) {
    for (const trans of this.transactions.values()) {
      trans.reject(reason);
    }
    this.transactions.clear();
  }
}

const WorkerWrapper = new Proxy(_WorkerWrapper, {
  construct(target, args) {
    const instance = new target(...args);
    // Return a proxy that waits for the "ready" signal
    return createExposedProxy(instance._ready.promise);
  },
});

/**
 * DEMO
 */
const workerImpl = () => {
  self.state = { count: 100 };
  self.someWork = (data) => `Worker processed: ${JSON.stringify(data)}`;

  self.onmessage = async (event) => {
    const { type, id, prop, val, args = [] } = event.data;
    let result;
    let error;

    try {
      if (type === "CALL_REMOTE") {
        const target = self[prop];
        result = typeof target === "function" ? await target(...args) : target;
      } else if (type === "SET_PROP") {
        self[prop] = val;
        result = true;
      } else if (type === "GET_PROP") {
        const val = self[prop];
        // Functions aren't transferable — return a sentinel
        result = typeof val === "function" ? { __type: "function", prop } : val;
      }
    } catch (err) {
      error = err.message;
    }

    self.postMessage({ id, result, error });
  };
  self.postMessage({ type: "ready" });
};

async function demo() {
  const blob = new Blob([`(${workerImpl.toString()})()`], {
    type: "application/javascript",
  });
  const url = URL.createObjectURL(blob);
  const worker = new WorkerWrapper(url);

  try {
    // 1. Remote property access
    const count = await worker.state;
    // worker.state calls GET_PROP on "state" -> returns {count: 100}
    // Then we access .count on the result
    console.log("Initial state:", count);

    const countValue = await worker.state.count;
    console.log("Initial count:", countValue);

    // 2. Remote function call
    const greeting = await worker.someWork({ msg: "Hello!" });
    console.log("Greeting:", greeting);

    // 3. Remote set
    worker.newVar = "Dynamic Value";

    // 4. Verify set
    const verified = await worker.newVar;
    console.log("Verified remote var:", verified);

    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Demo Error:", e);
  }
}

demo();
