if (typeof window.queueMicrotask !== 'function') {
  window.queueMicrotask = cb => requestAnimationFrame(cb);
}
