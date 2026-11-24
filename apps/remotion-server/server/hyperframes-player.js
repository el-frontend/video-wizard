// The outer shell owns messaging and transport. The inner document is the exact compiled project.
(async () => {
  const root = document.getElementById('player');
  const { parentOrigin, instance, nonce } = root.dataset;
  const version = 1;
  const send = (type, extra = {}) =>
    parent.postMessage({ type, version, instance, nonce, ...extra }, parentOrigin);
  const frame = document.createElement('iframe');
  frame.title = 'Composición HyperFrames';
  frame.allow = 'autoplay';
  Object.assign(frame.style, { border: '0', position: 'absolute', transformOrigin: 'top left' });
  Object.assign(root.style, { position: 'relative', overflow: 'hidden', background: '#101010' });
  const loaded = new Promise((ok, fail) => {
    frame.onload = ok;
    frame.onerror = fail;
  });
  frame.src = './native/index.html';
  root.append(frame);
  try {
    await loaded;
    const win = frame.contentWindow,
      doc = win.document,
      canvas = doc.querySelector('[data-composition-id]');
    const w = Number(canvas.dataset.width),
      h = Number(canvas.dataset.height),
      fps = Number(canvas.dataset.fps);
    const frames = Math.round(Number(canvas.dataset.duration) * fps);
    const resize = () => {
      const scale = Math.min(root.clientWidth / w, root.clientHeight / h);
      Object.assign(frame.style, {
        width: w + 'px',
        height: h + 'px',
        left: (root.clientWidth - w * scale) / 2 + 'px',
        top: (root.clientHeight - h * scale) / 2 + 'px',
        transform: 'scale(' + scale + ')',
      });
    };
    resize();
    new ResizeObserver(resize).observe(root);
    const runtime = doc.createElement('script');
    const boot = new Promise((ok, fail) => {
      runtime.onload = ok;
      runtime.onerror = fail;
    });
    // The pinned runtime reads its canonical FPS once at boot. Restore preview media sync afterwards.
    win.__HF_EXPORT_RENDER_SEEK_CONFIG = { fps, fpsSource: 'render-options' };
    runtime.src = './runtime.js';
    doc.body.append(runtime);
    await boot;
    const until = async (predicate) => {
      const deadline = performance.now() + 10000;
      while (!predicate()) {
        if (performance.now() > deadline) throw new Error('Tiempo de espera agotado.');
        await new Promise((ok) => setTimeout(ok, 12));
      }
    };
    await until(() => win.__playerReady && win.__renderReady && win.__player);
    delete win.__HF_EXPORT_RENDER_SEEK_CONFIG;
    try {
      await Promise.all([...doc.fonts].map((face) => face.load()));
    } catch {
      send('studio.error', { code: 'native-font' });
      return;
    }
    const player = win.__player;
    let generation = 0,
      animation = 0,
      playing = false,
      current = 0,
      ended = false;
    const pause = () => {
      playing = false;
      cancelAnimationFrame(animation);
      player.pause();
    };
    const publish = (index, cue) => {
      current = index;
      send('studio.time', {
        timeMs: Math.round((index * 1000) / fps),
        ...(cue !== undefined && { acknowledgedCueStartMs: cue }),
      });
    };
    const tick = () => {
      if (!playing) return;
      const index = Math.min(frames - 1, Math.max(0, Math.floor(player.getTime() * fps + 1e-7)));
      if (index !== current) publish(index);
      if (player.getTime() >= frames / fps || !player.isPlaying()) {
        ended = true;
        pause();
        return;
      }
      animation = requestAnimationFrame(tick);
    };
    const seek = async (ms, boundary) => {
      pause();
      ended = false;
      const serial = ++generation;
      const index = Math.min(
        frames - 1,
        (boundary === 'at-or-after' ? Math.ceil : Math.floor)((ms * fps) / 1000)
      );
      const at = index / fps;
      player.seek(at);
      const relevant = [...doc.querySelectorAll('video,audio')].filter((el) => {
        const start = Number(el.dataset.start);
        return at >= start && at < start + Number(el.dataset.duration);
      });
      await Promise.all(
        relevant.map(async (el) => {
          await until(() => serial !== generation || el.readyState >= 1 || el.error);
          if (serial !== generation) return;
          if (el.error) throw new Error('No se pudo decodificar el medio.');
          const target = Math.min(
            el.duration,
            Number(el.dataset.mediaStart ?? 0) + at - Number(el.dataset.start)
          );
          if (Math.abs(el.currentTime - target) > 0.001) el.currentTime = target;
          await until(
            () => serial !== generation || (!el.seeking && el.readyState >= 2) || el.error
          );
          if (el.error) throw new Error('No se pudo decodificar el medio.');
        })
      );
      if (serial === generation) publish(index, boundary === 'at-or-after' ? ms : undefined);
    };
    addEventListener('message', (event) => {
      const m = event.data;
      if (
        event.source !== parent ||
        event.origin !== parentOrigin ||
        m?.version !== version ||
        m.instance !== instance ||
        m.nonce !== nonce
      )
        return;
      if (m.type === 'studio.seek' && Number.isSafeInteger(m.timeMs) && m.timeMs >= 0)
        void seek(m.timeMs, m.boundary).catch(() => send('studio.error'));
      if (m.type === 'studio.pause') {
        ++generation;
        pause();
      }
      if (m.type === 'studio.play' && !playing) {
        ++generation;
        if (ended) {
          player.seek(0);
          publish(0);
          ended = false;
        }
        player.play();
        playing = true;
        animation = requestAnimationFrame(tick);
      }
    });
    await seek(0);
    send('studio.ready');
  } catch {
    send('studio.error');
  }
})();
