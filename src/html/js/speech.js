'use strict';

{
  const tts = {
    list: [],
    speed: 1,
    enable: false,
    isPlaying: false,
    audio: null,
  };

  // requestId -> { chunks: [Uint8Array], ended, error, mime, appendChunk?, finalize? }
  const streams = {};

  const MSE_MIME = 'audio/mpeg';
  const mseSupported = typeof MediaSource !== 'undefined'
    && typeof MediaSource.isTypeSupported === 'function'
    && MediaSource.isTypeSupported(MSE_MIME);

  document.addEventListener('add-to-playlist', (event) => {
    if (!tts.enable) {
      return;
    }

    const incomingList = Array.isArray(event.detail)
      ? event.detail.filter((url) => typeof url === 'string' && url)
      : [];

    if (incomingList.length === 0) {
      return;
    }

    tts.list.push(...incomingList);
    drainPlaylist();
  });

  // ---- Fish 流式播放 ----
  document.addEventListener('fish-stream-start', (event) => {
    const { requestId, mimeType } = event.detail || {};
    if (!requestId) {
      return;
    }

    // 不支持 MSE 或 TTS 关闭时，丢弃这次流式（文字照常显示）
    if (!tts.enable || !mseSupported) {
      streams[requestId] = { discarded: true };
      return;
    }

    streams[requestId] = {
      chunks: [],
      ended: false,
      error: false,
      mime: mimeType || MSE_MIME,
    };
    tts.list.push({ stream: true, requestId });
    drainPlaylist();
  });

  document.addEventListener('fish-stream-chunk', (event) => {
    const { requestId, chunk } = event.detail || {};
    const s = streams[requestId];
    if (!s || s.discarded || !chunk) {
      return;
    }

    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    if (typeof s.appendChunk === 'function') {
      s.appendChunk(bytes);
    } else {
      s.chunks.push(bytes);
    }
  });

  document.addEventListener('fish-stream-end', (event) => {
    const { requestId } = event.detail || {};
    const s = streams[requestId];
    if (!s || s.discarded) {
      return;
    }

    s.ended = true;
    if (typeof s.finalize === 'function') {
      s.finalize();
    }
  });

  document.addEventListener('fish-stream-error', (event) => {
    const { requestId } = event.detail || {};
    const s = streams[requestId];
    if (!s || s.discarded) {
      return;
    }

    s.error = true;
    if (typeof s.abort === 'function') {
      s.abort();
    }
  });

  document.addEventListener('set-speech-speed', (event) => {
    const speed = parseFloat(event.detail);
    if (typeof speed === 'number' && !isNaN(speed)) {
      tts.speed = speed;
      if (tts.audio) {
        tts.audio.playbackRate = tts.speed;
      }
    }
  });

  document.addEventListener('start-playing', () => {
    console.log('[TTS] start-playing event received, enabling TTS');
    tts.enable = true;
    drainPlaylist();
  });

  document.addEventListener('stop-playing', () => {
    console.log('[TTS] stop-playing event received, disabling TTS');
    tts.enable = false;
    tts.list = [];
    tts.isPlaying = false;

    Object.keys(streams).forEach((key) => delete streams[key]);

    try {
      if (tts.audio) {
        tts.audio.pause();
        if (typeof tts.audio.src === 'string' && tts.audio.src.startsWith('blob:')) {
          try { URL.revokeObjectURL(tts.audio.src); } catch (e) { console.log(e); }
        }
        tts.audio.src = '';
      }
    } catch (error) {
      console.log(error);
    } finally {
      tts.audio = null;
    }
  });

  function cleanupCurrentAudio(audio) {
    if (!audio) {
      return;
    }

    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;
  }

  function drainPlaylist() {
    if (!tts.enable || tts.isPlaying) {
      return;
    }

    const item = tts.list.shift();
    if (!item) {
      return;
    }

    if (item && item.stream) {
      playStream(item.requestId);
      return;
    }

    playUrl(item);
  }

  function playUrl(url) {
    try {
      cleanupCurrentAudio(tts.audio);

      const audio = new Audio(url);
      tts.audio = audio;
      tts.isPlaying = true;
      audio.currentTime = 0;
      audio.volume = 1;
      audio.playbackRate = tts.speed;

      audio.onplay = () => {
        tts.isPlaying = true;
      };

      audio.onended = () => {
        tts.isPlaying = false;
        if (tts.audio === audio) {
          tts.audio = null;
        }
        drainPlaylist();
      };

      audio.onerror = () => {
        tts.isPlaying = false;
        if (tts.audio === audio) {
          tts.audio = null;
        }
        drainPlaylist();
      };

      audio.onpause = () => {
        if (audio.ended) {
          return;
        }
        tts.isPlaying = false;
      };

      const playResult = audio.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch((error) => {
          console.log(error);
          tts.isPlaying = false;
          if (tts.audio === audio) {
            tts.audio = null;
          }
          drainPlaylist();
        });
      }
    } catch (error) {
      console.log(error);
      tts.isPlaying = false;
      tts.audio = null;
      drainPlaylist();
    }
  }

  function playStream(requestId) {
    const s = streams[requestId];
    if (!s || s.discarded || s.error) {
      finishStream(requestId, null);
      return;
    }

    cleanupCurrentAudio(tts.audio);

    let sourceBuffer = null;
    const appendQueue = [];

    const mediaSource = new MediaSource();
    const audio = new Audio();
    tts.audio = audio;
    tts.isPlaying = true;
    audio.volume = 1;
    audio.playbackRate = tts.speed;
    audio.src = URL.createObjectURL(mediaSource);

    function pump() {
      if (!sourceBuffer || sourceBuffer.updating || appendQueue.length === 0) {
        return;
      }
      try {
        sourceBuffer.appendBuffer(appendQueue.shift());
      } catch (error) {
        console.log('[TTS] appendBuffer failed', error);
      }
    }

    function tryEndOfStream() {
      if (s.ended && sourceBuffer && !sourceBuffer.updating && appendQueue.length === 0) {
        try {
          if (mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
        } catch (error) {
          console.log('[TTS] endOfStream failed', error);
        }
      }
    }

    audio.onended = () => finishStream(requestId, audio);
    audio.onerror = () => finishStream(requestId, audio);

    mediaSource.addEventListener('sourceopen', () => {
      try {
        sourceBuffer = mediaSource.addSourceBuffer(s.mime || MSE_MIME);
      } catch (error) {
        console.log('[TTS] addSourceBuffer failed', error);
        finishStream(requestId, audio);
        return;
      }

      sourceBuffer.addEventListener('updateend', () => {
        pump();
        tryEndOfStream();
      });

      // 后续到达的块直接进队列；错误则终止
      s.appendChunk = (bytes) => {
        appendQueue.push(bytes);
        pump();
      };
      s.finalize = () => tryEndOfStream();
      s.abort = () => {
        try {
          if (mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
        } catch (error) {
          console.log(error);
        }
      };

      // 冲刷播放前已缓冲的块
      for (let i = 0; i < s.chunks.length; i++) {
        appendQueue.push(s.chunks[i]);
      }
      s.chunks = [];
      pump();
      tryEndOfStream();

      const playResult = audio.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch((error) => {
          console.log(error);
          finishStream(requestId, audio);
        });
      }
    });
  }

  function finishStream(requestId, audio) {
    delete streams[requestId];

    if (audio && typeof audio.src === 'string' && audio.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(audio.src); } catch (error) { console.log(error); }
    }

    tts.isPlaying = false;
    if (!audio || tts.audio === audio) {
      tts.audio = null;
    }
    drainPlaylist();
  }
}
