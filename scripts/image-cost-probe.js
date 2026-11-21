// Injected before the page's own scripts (tv-bench.mjs {"inject": ...}): times the main-thread
// part of every createImageBitmap call and every WebGL texture upload from an image source, and
// how long each decode takes to resolve. {"eval": "__imageCost.start()"} clears the log,
// {"eval": "__imageCost.report()"} summarizes it. Runs in the TV's Chromium 69: ES2018 at most.
(function () {
  var log = { bitmap: [], upload: [] };
  var now = function () {
    return performance.now();
  };
  var kindOf = function (source) {
    if (typeof Blob !== 'undefined' && source instanceof Blob) return 'blob';
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return 'bitmap';
    return source && source.constructor ? source.constructor.name : typeof source;
  };

  var original = window.createImageBitmap;
  if (original) {
    window.createImageBitmap = function (source) {
      var options = arguments[arguments.length - 1];
      var resize = options && typeof options === 'object' && 'resizeWidth' in options;
      var entry = { kind: kindOf(source) + (resize ? '+resize' : ''), sync: 0, total: 0 };
      var t0 = now();
      var promise = original.apply(window, arguments);
      entry.sync = now() - t0;
      log.bitmap.push(entry);
      return promise.then(function (bitmap) {
        entry.total = now() - t0;
        entry.w = bitmap.width;
        return bitmap;
      });
    };
  }

  var wrap = function (proto, name) {
    if (!proto || !proto[name]) return;
    var fn = proto[name];
    proto[name] = function () {
      var source = arguments[arguments.length - 1];
      var kind = kindOf(source);
      if (kind !== 'bitmap' && kind !== 'HTMLCanvasElement' && kind !== 'HTMLImageElement') {
        return fn.apply(this, arguments);
      }
      var t0 = now();
      var result = fn.apply(this, arguments);
      log.upload.push({
        kind: name + ':' + kind,
        sync: now() - t0,
        w: source.width,
        h: source.height,
      });
      return result;
    };
  };
  var protos = [window.WebGLRenderingContext, window.WebGL2RenderingContext];
  for (var i = 0; i < protos.length; i++) {
    if (!protos[i]) continue;
    wrap(protos[i].prototype, 'texImage2D');
    wrap(protos[i].prototype, 'texSubImage2D');
  }

  var stats = function (values) {
    if (!values.length) return 'none';
    var s = values.slice().sort(function (a, b) {
      return a - b;
    });
    var sum = s.reduce(function (a, b) {
      return a + b;
    }, 0);
    var at = function (q) {
      return s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(1);
    };
    return (
      s.length +
      ' × mean ' +
      (sum / s.length).toFixed(1) +
      ' p50 ' +
      at(0.5) +
      ' p90 ' +
      at(0.9) +
      ' max ' +
      s[s.length - 1].toFixed(1) +
      ' (sum ' +
      sum.toFixed(0) +
      ' ms)'
    );
  };
  var group = function (entries, field) {
    var by = {};
    entries.forEach(function (e) {
      (by[e.kind] = by[e.kind] || []).push(e[field]);
    });
    return Object.keys(by)
      .map(function (k) {
        return '  ' + k + ' ' + field + ': ' + stats(by[k]);
      })
      .join('\n');
  };

  window.__imageCost = {
    log: log,
    start: function () {
      log.bitmap.length = 0;
      log.upload.length = 0;
      return 'cleared';
    },
    report: function () {
      var done = log.bitmap.filter(function (e) {
        return e.total;
      });
      var widths = {};
      log.upload.forEach(function (e) {
        var k = e.w + 'x' + e.h;
        widths[k] = (widths[k] || 0) + 1;
      });
      return [
        'createImageBitmap, main thread:',
        group(log.bitmap, 'sync'),
        'createImageBitmap, until resolved:',
        group(done, 'total'),
        'texture uploads, main thread:',
        group(log.upload, 'sync'),
        '  sizes: ' + JSON.stringify(widths),
      ].join('\n');
    },
  };
})();
