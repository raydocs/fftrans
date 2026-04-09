'use strict';

const PromiseQueue = require('../../utils/promise-queue');

const TTS_QUEUE_LANES = Object.freeze({
  SYNTHESIS: 'synthesis',
  CONTROL: 'control',
  BACKGROUND: 'background',
});

const TTS_QUEUE_CONCURRENCY = Object.freeze({
  [TTS_QUEUE_LANES.SYNTHESIS]: 2,
  [TTS_QUEUE_LANES.CONTROL]: 1,
  [TTS_QUEUE_LANES.BACKGROUND]: 1,
});

const queues = Object.keys(TTS_QUEUE_CONCURRENCY).reduce((result, lane) => {
  result[lane] = new PromiseQueue(TTS_QUEUE_CONCURRENCY[lane]);
  return result;
}, {});

const AI_TTS_CONCURRENCY = TTS_QUEUE_CONCURRENCY[TTS_QUEUE_LANES.SYNTHESIS];

function resolveLane(lane = TTS_QUEUE_LANES.SYNTHESIS) {
  return queues[lane] ? lane : TTS_QUEUE_LANES.SYNTHESIS;
}

function enqueue(task, lane = TTS_QUEUE_LANES.SYNTHESIS) {
  return queues[resolveLane(lane)].add(task);
}

function enqueueSynthesis(task) {
  return enqueue(task, TTS_QUEUE_LANES.SYNTHESIS);
}

function enqueueControl(task) {
  return enqueue(task, TTS_QUEUE_LANES.CONTROL);
}

function enqueueBackground(task) {
  return enqueue(task, TTS_QUEUE_LANES.BACKGROUND);
}

module.exports = {
  enqueue,
  enqueueSynthesis,
  enqueueControl,
  enqueueBackground,
  AI_TTS_CONCURRENCY,
  TTS_QUEUE_LANES,
  TTS_QUEUE_CONCURRENCY,
};
