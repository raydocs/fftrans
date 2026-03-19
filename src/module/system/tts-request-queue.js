'use strict';

const PromiseQueue = require('../../utils/promise-queue');

const AI_TTS_CONCURRENCY = 2;
const aiTtsQueue = new PromiseQueue(AI_TTS_CONCURRENCY);

function enqueue(task) {
  return aiTtsQueue.add(task);
}

module.exports = {
  enqueue,
  AI_TTS_CONCURRENCY,
};
