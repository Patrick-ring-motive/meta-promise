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
    for(const prop of ['then','catch','finally','reject','resolve','try']){
      if(typeof promise[prop] === 'function'){
        promiseFn[prop] = promise[prop].bind(fnOrPromise);
      }else if(prop in promise){
        promiseFn[prop] = promise[prop];
      }
    }
    return promiseFn;
  }
  return fnOrPromise;
}

class $PromiseFunction extends Function {}

const PromiseFunction = new Proxy($PromiseFunction, {
  construct(target, args, receiver){
    const $this = receiver ?? target;
    return promiseFunction(args[0]);
  }
});


