/**
 * ExposedPromise
 *
 * A Promise wrapper that surfaces all internals:
 *   - .promise  — the underlying Promise
 *   - .resolve  — the resolve function
 *   - .reject   — the reject function
 *   - .executor — the original input function (if any)
 *   - .status   — "pending" | "fulfilled" | "rejected"
 *   - .value    — settled value or rejection reason
 */
class ExposedPromise {
  constructor(executor) {
    this.status = "pending";
    this.value = undefined;
    this.executor = executor ?? null;

    this.promise = new Promise((resolve, reject) => {
      this.resolve = (value) => {
        if (this.status !== "pending") return;
        this.status = "fulfilled";
        this.value = value;
        resolve(value);
      };

      this.reject = (reason) => {
        if (this.status !== "pending") return;
        this.status = "rejected";
        this.value = reason;
        reject(reason);
      };

      if (executor) {
        try {
          executor(this.resolve, this.reject);
        } catch (err) {
          this.reject(err);
        }
      }
    });
  }

  get settled() {
    return this.status !== "pending";
  }

  // Proxy .then / .catch / .finally so the instance itself is thenable
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

module.exports = { ExposedPromise };
