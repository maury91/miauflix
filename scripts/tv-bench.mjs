#!/usr/bin/env node
// Drives the Miauflix page on a TV over Chrome DevTools and measures frame timing.
// See docs/development/tv-benchmarks.md for the scenarios and past results.
//
// Usage: node scripts/tv-bench.mjs '<steps>' [devtools host, default 127.0.0.1:9222]
// Steps (a JSON array, run in order):
//   {"key": "ArrowRight", "repeat": 4, "delay": 600}  press a key (delay: ms after each press, default 250)
//   {"hold": "ArrowDown", "ms": 2500}                hold a key (auto-repeat every 50 ms), then release
//   {"wait": 1000}                                   wait
//   {"reload": true}                                 reload the page and wait for it to load, so what
//                                                    follows starts cold (a remembered profile opens on
//                                                    Home, after the intro: wait for a focused card)
//   {"until": "<expression>", "ms": 30000}           wait until an expression is truthy (polled every 250 ms)
//   {"start": true} / {"stop": true}                 record frames between them and print the summary
//   {"state": true}                                  print the page, heading, virtual and DOM focus
//   {"eval": "<expression>"}                         print an expression's value
//   {"inject": "scripts/react-commit-probe.js"}      run a script before the page's own on every
//                                                    later load (put it before a reload); with the
//                                                    commit probe, {"eval": "__reactCommits.start()"}
//                                                    and {"eval": "__reactCommits.report()"} log
//                                                    React commits in between
//   {"serve": "<dir>", "match": "/api/artwork/card/", "ext": "jpeg"}
//                                                    answer the page's requests whose URL contains
//                                                    `match` from local files for the rest of the run
//                                                    (`<dir>/<type>-<id>-<size>.<ext>` from a card
//                                                    image URL; ext "auto" serves the format the URL
//                                                    names; missing, or ext "none": a 404), to try
//                                                    server responses that are not deployed yet
//   {"served": true}                                 print how many requests "serve" answered
//   {"profile": "start"} / {"profile": "stop", "out": "file.cpuprofile"}
//                                                    record a CPU profile (open it in Chrome DevTools)
// Keys: ArrowUp/Down/Left/Right, Enter, Back (the remote's Return, as Tizen reports it).
// Screenshots are not available: Tizen 5.5 never answers Page.captureScreenshot.

import { readFileSync, writeFileSync } from 'node:fs';

const [stepsArg, host = '127.0.0.1:9222'] = process.argv.slice(2);
if (!stepsArg) {
  console.error("Usage: node scripts/tv-bench.mjs '<steps json>' [host:port]");
  process.exit(1);
}
const steps = JSON.parse(stepsArg);

// Runs in the TV's Chromium 69: ES2018 at most.
const PROBE = `(function () {
  window.__bench = {
    frames: [], recording: 0, startedAt: 0,
    start: function () {
      // Each recording has its own number: a frame chain left over from an earlier start stops itself
      var b = this; var run = b.recording = (b.lastRun = (b.lastRun || 0) + 1);
      b.frames = []; b.startedAt = performance.now();
      var last = b.startedAt;
      function tick(t) { if (b.recording !== run) return; b.frames.push(t - last); last = t; requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    },
    stop: function () {
      this.recording = 0;
      var elapsed = performance.now() - this.startedAt;
      var f = this.frames.slice(1);
      if (!f.length) return 'no frames';
      var s = f.slice().sort(function (a, b) { return a - b; });
      var at = function (q) { return s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(1); };
      var over = function (ms) { return f.filter(function (x) { return x > ms; }).length; };
      return (f.length / (elapsed / 1000)).toFixed(0) + ' fps over ' + (elapsed / 1000).toFixed(1) + ' s | ' +
        f.length + ' frames, p50 ' + at(0.5) + ' ms, p90 ' + at(0.9) + ' ms, p95 ' + at(0.95) +
        ' ms, max ' + s[s.length - 1].toFixed(0) + ' ms | over 34 ms: ' + over(34) + ', over 50 ms: ' + over(50);
    },
    state: function () {
      var h = document.querySelector('h1,h2');
      var focused = [].map.call(document.querySelectorAll('[data-focused]'), function (e) {
        var input = e.querySelector && e.querySelector('input');
        var label = input && input.id && document.querySelector('label[for="' + input.id + '"]');
        return (e.getAttribute('aria-label') || (label && 'field ' + label.textContent) || e.textContent || '')
          .replace(/\\s+/g, ' ').trim().slice(0, 40);
      });
      var a = document.activeElement;
      return location.pathname + location.hash + ' | heading: ' + (h && h.textContent) +
        ' | virtual focus: ' + focused.join(' / ') + ' | DOM focus: ' +
        (a && a !== document.body ? (a.getAttribute('aria-label') || a.textContent || a.tagName).replace(/\\s+/g, ' ').trim().slice(0, 40) : 'body');
    }
  };
  return 'ok';
})()`;

const KEYS = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Back: 10009 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const pages = await (await fetch(`http://${host}/json`)).json();
const page = pages.find(entry => entry.type === 'page' && entry.title === 'Miauflix') ?? pages[0];
if (!page) throw new Error(`No page to debug at ${host}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const eventWaiters = new Map();
const nextEvent = method =>
  new Promise((resolve, reject) => eventWaiters.set(method, { resolve, reject }));
/** Set by the "serve" step: answers intercepted requests. */
let onRequestIntercepted;
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Network.requestIntercepted' && onRequestIntercepted)
    onRequestIntercepted(message.params);
  const waiter = message.method && eventWaiters.get(message.method);
  if (waiter) {
    eventWaiters.delete(message.method);
    waiter.resolve(message.params);
  }
  const waiting = message.id && pending.get(message.id);
  if (!waiting) return;
  pending.delete(message.id);
  if (message.error) waiting.reject(new Error(JSON.stringify(message.error)));
  else waiting.resolve(message.result);
};
// A closed connection never answers: fail whatever is still waiting so the steps stop and clean up
ws.onclose = () => {
  const closed = new Error('DevTools connection closed');
  for (const waiting of pending.values()) waiting.reject(closed);
  pending.clear();
  for (const waiter of eventWaiters.values()) waiter.reject(closed);
  eventWaiters.clear();
};
const CONTENT_TYPES = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
/** Answers intercepted requests from `dir` (see the "serve" step). Chromium 69 has no Fetch domain. */
const serveFrom =
  (dir, ext) =>
  async ({ interceptionId, request }) => {
    const card = /\/card\/(movie|tv)\/(\d+)\/(sm|md|lg)\.(\w+)/u.exec(
      new URL(request.url).pathname
    );
    // "auto": the format the URL names
    const format = ext === 'auto' ? (card?.[4] === 'jpg' ? 'jpeg' : card?.[4]) : ext;
    let body;
    try {
      if (card && ext !== 'none')
        body = readFileSync(`${dir}/${card[1]}-${card[2]}-${card[3]}.${format}`);
    } catch {
      body = undefined;
    }
    const head = body
      ? `HTTP/1.1 200 OK\r\nContent-Type: ${CONTENT_TYPES[format] ?? 'application/octet-stream'}\r\nContent-Length: ${body.length}\r\nCache-Control: public, max-age=31536000, immutable\r\nAccess-Control-Allow-Origin: *\r\n\r\n`
      : 'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\n\r\n';
    const raw = body ? Buffer.concat([Buffer.from(head), body]) : Buffer.from(head);
    served[body ? 'hits' : 'misses'] += 1;
    await send('Network.continueInterceptedRequest', {
      interceptionId,
      rawResponse: raw.toString('base64'),
    }).catch(() => undefined);
  };
const served = { hits: 0, misses: 0 };

const evaluate = async expression => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails)
    throw new Error(
      `${expression.slice(0, 80)} threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`
    );
  return result.value;
};
// The TV reports its remote keys as Unidentified with a key code; arrows and Enter by name
const keyEvent = (name, type, autoRepeat = false) => {
  const code = KEYS[name];
  if (!code) throw new Error(`Unknown key ${name}`);
  return send('Input.dispatchKeyEvent', {
    type,
    autoRepeat,
    key: name === 'Back' ? 'Unidentified' : name,
    code: name,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code,
  });
};

ws.onerror = () => {
  console.error(`Could not connect to ${page.webSocketDebuggerUrl}`);
  process.exit(1);
};
ws.onopen = async () => {
  try {
    await evaluate(PROBE);
    for (const step of steps) {
      if (step.key) {
        for (let press = 0; press < (step.repeat ?? 1); press++) {
          await keyEvent(step.key, 'rawKeyDown');
          await keyEvent(step.key, 'keyUp');
          await sleep(step.delay ?? 250);
        }
        console.log(`key ${step.key} x${step.repeat ?? 1}`);
      } else if (step.hold) {
        const end = Date.now() + step.ms;
        for (let first = true; Date.now() < end; first = false) {
          await keyEvent(step.hold, 'rawKeyDown', !first);
          await sleep(50);
        }
        await keyEvent(step.hold, 'keyUp');
        console.log(`hold ${step.hold} ${step.ms} ms`);
      } else if (step.wait) await sleep(step.wait);
      else if (step.reload) {
        await send('Page.enable');
        const loaded = nextEvent('Page.loadEventFired');
        await send('Page.reload', { ignoreCache: true });
        await loaded;
        await evaluate(PROBE);
        console.log('reloaded');
      } else if (step.until) {
        const end = Date.now() + (step.ms ?? 30000);
        const startedAt = Date.now();
        while (!(await evaluate(`!!(${step.until})`))) {
          if (Date.now() > end) throw new Error(`Timed out waiting for ${step.until}`);
          await sleep(250);
        }
        console.log(`until: true after ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
      } else if (step.start) await evaluate('__bench.start()');
      else if (step.stop) console.log(`frames: ${await evaluate('__bench.stop()')}`);
      else if (step.state) console.log(`state: ${await evaluate('__bench.state()')}`);
      else if (step.eval !== undefined) {
        const value = await evaluate(step.eval);
        console.log(`eval: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
      } else if (step.inject) {
        await send('Page.enable');
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: readFileSync(step.inject, 'utf8'),
        });
        console.log(`injected ${step.inject} for the next loads`);
      } else if (step.serve) {
        await send('Network.enable');
        onRequestIntercepted = serveFrom(step.serve, step.ext ?? 'jpeg');
        await send('Network.setRequestInterception', {
          patterns: [{ urlPattern: `*${step.match ?? '/api/artwork/card/'}*` }],
        });
        console.log(
          `serving ${step.match ?? '/api/artwork/card/'} from ${step.serve} (${step.ext ?? 'jpeg'})`
        );
      } else if (step.served) {
        console.log(`served: ${served.hits} files, ${served.misses} not found`);
      } else if (step.profile === 'start') {
        await send('Profiler.enable');
        await send('Profiler.setSamplingInterval', { interval: step.interval ?? 200 });
        await send('Profiler.start');
      } else if (step.profile === 'stop') {
        const { profile } = await send('Profiler.stop');
        writeFileSync(step.out ?? 'tv.cpuprofile', JSON.stringify(profile));
        console.log(`profile: ${step.out ?? 'tv.cpuprofile'}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  ws.close();
};
