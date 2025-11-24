'use strict';

class PromiseQueue {
    constructor(concurrency = 1) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.next();
        });
    }

    next() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const { task, resolve, reject } = this.queue.shift();
        this.running++;

        task()
            .then(resolve)
            .catch(reject)
            .finally(() => {
                this.running--;
                this.next();
            });
    }
}

module.exports = PromiseQueue;
