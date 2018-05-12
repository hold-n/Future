// TODO!: test

class Future {

    constructor(callback) {
        this.state = 'pending';
        this.value = undefined;
        this.subscribers = [];

        try {
            callback(this._resolve.bind(this), this._reject.bind(this));
        } catch (e) {
            this._reject(e);
        }
    }

    static resolve(value) {
        return new Future(resolve => resolve(value));
    }

    static reject(error) {
        // TODO!: Future.reject(6).then(console.info, console.warn) must not result in error. async (resolve, reject)?
        return new Future((resolve, reject) => reject(error));
    }

    static all(promises) {
        promises = promises || [];
        if (!promises.length) {
            return Future.resolve([]);
        }

        return new Future((resolve, reject) => {
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
        return new Future((resolve, reject) => {
            for (const promise of promises || []) {
                if (this._isThenable(promise)) {
                    promise.then(resolve, reject);
                } else {
                    resolve(promise);
                }
            }
        });
    }

    static _isThenable(obj) {
        // TODO: retrieving a property might throw, need to reject then
        return obj && obj.then && obj.then === 'function';
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
        return new Future((resolve, reject) => {
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

    _chain(callback, {resolve, reject}, defaultSettler) {
        if (!callback) {
            return false;
        }
        // always execute in another loop tick according to the spec
        setTimeout(() => {
            try {
                if (callback && typeof callback === 'function') {
                    const result = callback(this.value);
                    if (Future._isThenable(result)) {
                        result.then(resolve, reject);
                    } else {
                        resolve(result);
                    }
                } else {
                    defaultSettler(this.value);
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

    _reject(error) {
        const subscribers = this._settle(error, 'rejected');
        if (subscribers) {
            let handlerCount = 0
            for (const subscriber of subscribers) {
                const processed = this._rejectChained(subscriber);
                handlerCount += processed ? 1 : 0;
            }

            if (!handlerCount) {
                // no error handlers specified => unhandled in promise
                console.error('Unhandled in promise:');
                console.error(error);
            }
        }
    }

    _rejectChained(subscriber) {
        return this._chain(subscriber.errorCallback, subscriber, subscriber.reject);
    }

    _resolve(value) {
        const subscribers = this._settle(value, 'fulfilled');
        if (subscribers) {
            for (const subscriber of subscribers) {
                this._resolveChained(subscriber);
            }
        }
    }

    _resolveChained(subscriber) {
        return this._chain(subscriber.resultCallback, subscriber, subscriber.resolve);
    }

    _settle(value, state) {
        if (!this._isSettled) {
            if (value === this) {
                this._reject(new TypeError('Cannot settle a promise with itself as a value.'));
                return undefined;
            }
            this.value = value;
            this.state = state;
            const subscribers = this.subscribers;
            this.subscribers = [];
            Object.freeze(this);
            return subscribers;
        }
        return undefined;;
    }
}
