// A React DevTools-style hook that logs every React commit: the components that rendered and why,
// the passive and layout effects queued, and Redux store notifications (the slices changed). Inject it before the app boots (see
// tv-bench.mjs's "inject" step, or paste it into a page before React loads), then:
//   __reactCommits.start()   begin recording (after a key, a timer and so on)
//   __reactCommits.report()  stop and return the log as text
// Runs in the TV's Chromium 69: ES2018 at most. Works on production builds: React still calls the
// hook there, only component names are minified (the log then shows the start of their source).
(function () {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
  // Fiber tags (React 19)
  var FUNCTION = 0;
  var CLASS = 1;
  var FORWARD_REF = 11;
  var MEMO = 14;
  var SIMPLE_MEMO = 15;
  var PERFORMED_WORK = 1;
  var UPDATE = 4;
  var PASSIVE = 2048;
  var log = [];
  var recording = false;
  var startedAt = 0;
  var dispatches = [];
  var wrappedStore = null;

  function typeName(fiber) {
    var type = fiber.type;
    if (!type) return '?';
    if (fiber.tag === FORWARD_REF && type.render) type = type.render;
    if (fiber.tag === MEMO && type.type) type = type.type;
    if (type.type && typeof type.type === 'function') type = type.type;
    if (type.render && typeof type.render === 'function') type = type.render;
    var name = type.displayName || type.name || '';
    if (name.length > 2) return name;
    var source = typeof type === 'function' ? String(type) : '';
    return (name || 'anon') + '{' + source.replace(/\s+/g, ' ').slice(0, 90) + '}';
  }

  function changedProps(fiber) {
    var prev = fiber.alternate && fiber.alternate.memoizedProps;
    var next = fiber.memoizedProps;
    if (!prev || !next || prev === next) return [];
    var keys = {};
    Object.keys(prev).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(next).forEach(function (k) {
      keys[k] = true;
    });
    return Object.keys(keys).filter(function (k) {
      return prev[k] !== next[k];
    });
  }

  function changedHooks(fiber) {
    if (!fiber.alternate || fiber.tag === CLASS) return [];
    var prev = fiber.alternate.memoizedState;
    var next = fiber.memoizedState;
    var changed = [];
    for (var index = 0; next; index++) {
      // useState/useReducer/useSyncExternalStore keep their value in memoizedState; effects and
      // memos too, so only report hooks with a queue (state) whose value changed
      if (next.queue && prev && prev.memoizedState !== next.memoizedState) changed.push(index);
      next = next.next;
      prev = prev && prev.next;
    }
    return changed;
  }

  function contextChanged(fiber) {
    var deps = fiber.dependencies;
    var prevDeps = fiber.alternate && fiber.alternate.dependencies;
    if (!deps || !deps.firstContext) return false;
    for (var c = deps.firstContext, p = prevDeps && prevDeps.firstContext; c; c = c.next) {
      if (p && p.memoizedValue !== c.memoizedValue) return true;
      p = p && p.next;
    }
    return false;
  }

  function walk(fiber, out) {
    while (fiber) {
      var tag = fiber.tag;
      var component =
        tag === FUNCTION ||
        tag === CLASS ||
        tag === FORWARD_REF ||
        tag === MEMO ||
        tag === SIMPLE_MEMO;
      if (fiber.flags & PASSIVE) out.passive += 1;
      if (component && fiber.flags & UPDATE) out.layout += 1;
      if (component && !fiber.alternate) {
        out.rendered.push({ name: typeName(fiber), why: 'mount' });
      } else if (component && fiber.flags & PERFORMED_WORK) {
        var why = [];
        var props = changedProps(fiber);
        var hooks = changedHooks(fiber);
        if (hooks.length) why.push('state#' + hooks.join(','));
        if (props.length) why.push('props:' + props.join(','));
        if (contextChanged(fiber)) why.push('context');
        if (!why.length)
          why.push(
            fiber.memoizedProps === (fiber.alternate || {}).memoizedProps
              ? 'store/context'
              : 'parent'
          );
        out.rendered.push({ name: typeName(fiber), why: why.join(' ') });
      }
      // A subtree that bailed out keeps last commit's fibers: nothing below it rendered
      if (fiber.child && (!fiber.alternate || fiber.child !== fiber.alternate.child)) {
        walk(fiber.child, out);
      }
      fiber = fiber.sibling;
    }
  }

  function findStore(fiber, depth) {
    for (; fiber && depth < 60; fiber = fiber.child, depth++) {
      var props = fiber.memoizedProps;
      if (props && props.store && typeof props.store.dispatch === 'function') return props.store;
    }
    return null;
  }

  // Components captured the store's dispatch before the first commit, so dispatches are seen
  // through a subscription: each notification and the state slices it changed
  function wrapStore(root) {
    if (wrappedStore) return;
    var store = findStore(root.current, 0);
    if (!store) return;
    wrappedStore = store;
    var previous = store.getState();
    store.subscribe(function () {
      var next = store.getState();
      if (recording) {
        var changed = Object.keys(next).filter(function (key) {
          return next[key] !== previous[key];
        });
        var detail = changed.map(function (key) {
          var a = previous[key];
          var b = next[key];
          if (!a || !b || typeof b !== 'object') return key;
          var inner = Object.keys(b).filter(function (k) {
            return a[k] !== b[k];
          });
          return key + (inner.length && inner.length < 5 ? '.' + inner.join('/') : '');
        });
        dispatches.push({
          t: performance.now() - startedAt,
          type: 'notify: ' + (detail.length ? detail.join(', ') : 'no change'),
        });
      }
      previous = next;
    });
  }

  var nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: function (renderer) {
      var id = nextId++;
      this.renderers.set(id, renderer);
      return id;
    },
    checkDCE: function () {},
    onScheduleFiberRoot: function () {},
    onCommitFiberUnmount: function () {},
    onPostCommitFiberRoot: function () {},
    setStrictMode: function () {},
    onCommitFiberRoot: function (_id, root) {
      wrapStore(root);
      if (!recording) return;
      var at = performance.now();
      var out = { rendered: [], passive: 0, layout: 0 };
      walk(root.current.child, out);
      log.push({ t: at - startedAt, out: out, took: performance.now() - at });
    },
  };

  window.__reactCommits = {
    start: function () {
      log = [];
      dispatches = [];
      recording = true;
      startedAt = performance.now();
      return 'recording';
    },
    report: function () {
      recording = false;
      var lines = [];
      var events = log
        .map(function (entry) {
          return { t: entry.t, commit: entry };
        })
        .concat(
          dispatches.map(function (d) {
            return { t: d.t, dispatch: d.type };
          })
        )
        .sort(function (a, b) {
          return a.t - b.t;
        });
      var commits = 0;
      var renders = 0;
      events.forEach(function (event) {
        if (event.dispatch) {
          lines.push(event.t.toFixed(0) + ' ms  store ' + event.dispatch);
          return;
        }
        var out = event.commit.out;
        commits += 1;
        renders += out.rendered.length;
        var counts = {};
        out.rendered.forEach(function (r) {
          var key = r.name + ' (' + r.why + ')';
          counts[key] = (counts[key] || 0) + 1;
        });
        lines.push(
          event.t.toFixed(0) +
            ' ms  commit: ' +
            out.rendered.length +
            ' rendered, ' +
            out.passive +
            ' passive-effect fibers, ' +
            out.layout +
            ' layout-effect components'
        );
        Object.keys(counts).forEach(function (key) {
          lines.push('      ' + (counts[key] > 1 ? counts[key] + ' × ' : '') + key);
        });
      });
      lines.unshift(
        commits +
          ' commits, ' +
          renders +
          ' component renders, ' +
          dispatches.length +
          ' store notifications'
      );
      return lines.join('\n');
    },
  };
})();
