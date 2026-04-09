'use strict';

{
  const tts = {
    list: [],
    speed: 1,
    enable: false,
    isPlaying: false,
    audio: null,
  };

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

    try {
      if (tts.audio) {
        tts.audio.pause();
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

    const url = tts.list.shift();
    if (!url) {
      return;
    }

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
}
