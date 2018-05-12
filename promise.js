class _Promise {

    constructor(callback) {
        this.state = 'pending';
        this.value = undefined;
        this.subscribers = [];

        try {
            callback(this._resolve.bind(this), this._reject.bind(this));
        } catch (e) {
            this._reject(e);
            // NOTE: throw manually in case rejected in callback and thus _reject() did not throw
            throw e;
        }
    }

    static resolve(value) {
        return new _Promise(resolve => resolve(value));
    }

    static reject(error) {
        return new _Promise((resolve, reject) => reject(error));
    }

    static all(promises) {
        promises = promises || [];
        if (!promises.length) {
            return _Promise.resolve([]);
        }

        return new _Promise((resolve, reject) => {
            const result = [];
            let counter = 0;
            for (let i = 0; i < promises.length; i++) {
                const promise = promises[i];
                const index = i;
                if (this._isThenable(promise)) {
                    promise.then(value => storeValue(index, value), reject);
                } else {
                    storeValue(index, promise);
                }

            }
            function storeValue(index, value) {
                result[index] = value;
                counter++;
                if (counter === promises.length) {
                    resolve(result);
                }
            }
        });
    }

    static race(promises) {
        return new _Promise((resolve, reject) => {
            for (const promise of promises || []) {
                if (this._isThenable(promise)) {
                    promise.then(resolve, reject);
                } else {
                    resolve(promise);
                }
            }
        });
    }

    catch(errorCallback) {
        return this.then(null, errorCallback);
    }

    finally(callback) {
        return this.then(value => {
            callback();
            return value;
        }, error => {
            callback();
            throw error;
        });
    }

    then(resultCallback, errorCallback) {
        return new _Promise((resolve, reject) => {
            const subscriber = {resolve, reject, resultCallback, errorCallback};
            if (this._isSettled) {
                if (this.state === 'fulfilled') {
                    this._resolveChained(subscriber);
                } else {
                    this._rejectChained(subscriber);
                }
            } else {
                this.subscribers.push(subscriber);
            }
        });
    }

    _chain(callback, {resolve, reject}) {
        if (!callback) {
            return false;
        }
        // always execute in another loop tick according to the spec
        setTimeout(() => {
            try {
                const result = callback(this.value);
                if (this._isThenable(result)) {
                    result.then(resolve);
                } else {
                    resolve(result);
                }
            } catch (e) {
                reject(e);
            }
        });
        return true;
    }

    get _isSettled() {
        return this.state !== 'pending';
    }

    _isThenable(obj) {
        return obj && obj.then && obj.then === 'function';
    }

    _reject(error) {
        // TODO: freeze properties
        if (!this._isSettled) {
            this.state = 'rejected';
            this.value = error;

            let handlerCount = 0
            for (const subscriber of this.subscribers) {
                const processed = this._rejectChained(subscriber);
                handlerCount += processed ? 1 : 0;
            }
            this.subscribers = [];

            if (!handlerCount) {
                // no error handlers specified => unhandled in promise
                throw error;
            }
        }
    }

    _rejectChained(subscriber) {
        return this._chain(subscriber.errorCallback, subscriber);
    }

    _resolve(value) {
        // TODO: freeze properties
        if (!this._isSettled) {
            this.state = 'fulfilled';
            this.value = value;

            for (const subscriber of this.subscribers) {
                this._resolveChained(subscriber);
            }
            this.subscribers = [];
        }
    }

    _resolveChained(subscriber) {
        return this._chain(subscriber.resultCallback, subscriber);
    }
}
