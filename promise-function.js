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

