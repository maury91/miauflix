#!/usr/bin/env node
// Opens the Miauwatch TV app's DevTools on this machine, without the Tizen SDK: what
// `sdb shell 0 debug <app>` and `sdb forward` do, over SDB's own protocol. It closes the app,
// launches it in debug mode and serves its inspector on 127.0.0.1:<port> until stopped (Ctrl-C),
// for Chrome's chrome://inspect and scripts/tv-bench.mjs.
//
// Usage: node scripts/tv-debug.mjs <tv-ip> [app id] [local port]
//   tv-ip     the TV (or MIAUFLIX_TV_IP); `apps2samsung-cli scan` finds it. Developer Mode must
//             point to this machine, and nothing else may hold the TV's SDB connection (the
//             Apps2Samsung desktop app does while it's open: quit it first)
//   app id    default 8nvJKZYaJb.Mauflix (frontend/tizen/config.xml)
//   port      default 9222
//
// Reinstalling the app (scripts/install-tizen.sh) ends the debug session: run this again.

import net from 'node:net';

const args = process.argv.slice(2);
const tvIp = args[0] ?? process.env.MIAUFLIX_TV_IP;
const appId = args[1] ?? '8nvJKZYaJb.Mauflix';
const localPort = Number(args[2] ?? 9222);
if (!tvIp) {
  console.error('Usage: node scripts/tv-debug.mjs <tv-ip> [app id] [local port]');
  process.exit(1);
}

const SDB_PORT = 26101;
/** Connecting and launching the app must be done by then (a TV that never answers hangs). */
const STARTUP_MS = 60_000;
/** Bytes queued for the TV on one stream above which its local client is paused, and below which it resumes. */
const QUEUE_HIGH = 1024 * 1024;
const QUEUE_LOW = 256 * 1024;
const CMD = {
  CNXN: 0x4e584e43,
  OPEN: 0x4e45504f,
  OKAY: 0x59414b4f,
  CLSE: 0x45534c43,
  WRTE: 0x45545257,
};

/** An SDB message: a 24-byte header (little endian) and its payload, as in ADB. */
function message(command, arg0, arg1, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(24);
  let checksum = 0;
  for (const byte of data) checksum = (checksum + byte) >>> 0;
  header.writeUInt32LE(command, 0);
  header.writeUInt32LE(arg0 >>> 0, 4);
  header.writeUInt32LE(arg1 >>> 0, 8);
  header.writeUInt32LE(data.length, 12);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE((command ^ 0xffffffff) >>> 0, 20);
  return Buffer.concat([header, data]);
}

/** One SDB connection to the TV, carrying any number of streams (shell commands, TCP). */
function connectSdb(host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(SDB_PORT, host);
    const streams = new Map();
    let pending = Buffer.alloc(0);
    let nextId = 1;
    let connected = false;
    let closed = false;
    /** The most the TV takes in one message's payload (its CNXN's maxdata). */
    let maxData = 0;

    const sdb = {
      device: '',
      /**
       * Opens a service ('shell:…', 'tcp:<port>'); data and close arrive through the handlers.
       * Flow control both ways: `write` returns false once enough waits for the TV (`onDrain`
       * follows when it's taken), and `onData` returning false holds the TV's next data until
       * `resume`.
       */
      open(service, { onData, onClose, onDrain }) {
        const stream = {
          id: nextId++,
          remote: 0,
          queue: [],
          queued: 0,
          blocked: false,
          inFlight: false,
          held: null,
          onData,
          onClose,
        };
        if (closed) {
          // The connection is gone: nothing would ever answer
          stream.close = stream.resume = () => {};
          stream.write = () => true;
          queueMicrotask(onClose);
          return stream;
        }
        const flush = () => {
          if (!stream.remote || stream.inFlight || !stream.queue.length) return;
          stream.inFlight = true;
          const data = stream.queue.shift();
          stream.queued -= data.length;
          socket.write(message(CMD.WRTE, stream.id, stream.remote, data));
          if (stream.blocked && stream.queued <= QUEUE_LOW) {
            stream.blocked = false;
            onDrain?.();
          }
        };
        stream.acknowledged = () => {
          stream.inFlight = false;
          flush();
        };
        stream.write = data => {
          // The TV takes at most its max payload per message
          for (let offset = 0; offset < data.length; offset += maxData)
            stream.queue.push(data.subarray(offset, offset + maxData));
          stream.queued += data.length;
          flush();
          if (stream.queued > QUEUE_HIGH) stream.blocked = true;
          return !stream.blocked;
        };
        /** Takes the TV's next data (held back while the handler couldn't). */
        stream.resume = () => {
          if (!stream.held || !streams.has(stream.id)) return;
          socket.write(stream.held);
          stream.held = null;
        };
        stream.close = () => {
          if (!streams.has(stream.id)) return;
          // Not open yet: a CLSE needs the TV's id for the stream, which its OKAY brings
          if (!stream.remote) {
            stream.closing = true;
            return;
          }
          streams.delete(stream.id);
          socket.write(message(CMD.CLSE, stream.id, stream.remote));
        };
        streams.set(stream.id, stream);
        socket.write(message(CMD.OPEN, stream.id, 0, Buffer.from(`${service}\0`)));
        return stream;
      },
      /** Runs a shell command and resolves with its output. */
      shell(command) {
        return new Promise(done => {
          let output = '';
          sdb.open(`shell:${command}`, {
            onData: data => (output += data),
            onClose: () => done(output.trim()),
          });
        });
      },
      close: () => socket.end(),
      /** Called when the TV ends the connection after it was up. */
      onDisconnect: null,
    };

    socket.on('error', error => (connected ? console.error(error.message) : reject(error)));
    socket.on('close', () => {
      closed = true;
      if (!connected) reject(new Error(`${host} closed the SDB connection`));
      for (const stream of streams.values()) stream.onClose();
      streams.clear();
      if (connected) sdb.onDisconnect?.();
    });
    socket.on('connect', () =>
      socket.write(message(CMD.CNXN, 0x02000000, 256 * 1024, Buffer.from('host::\0')))
    );
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 24) {
        const command = pending.readUInt32LE(0);
        const arg0 = pending.readUInt32LE(4);
        const arg1 = pending.readUInt32LE(8);
        const length = pending.readUInt32LE(12);
        if (pending.length < 24 + length) break;
        const data = pending.subarray(24, 24 + length);
        pending = pending.subarray(24 + length);

        if (command === CMD.CNXN) {
          if (!connected) {
            if (!arg1) {
              reject(new Error(`${host} announced no payload size`));
              socket.destroy();
              return;
            }
            maxData = arg1;
            connected = true;
            sdb.device = data.toString().replace(/\0/g, '').split('::')[1] ?? '';
            resolve(sdb);
          }
          continue;
        }
        const stream = streams.get(arg1);
        if (!stream) continue;
        if (command === CMD.OKAY) {
          stream.remote = arg0;
          if (stream.closing) stream.close();
          else stream.acknowledged();
        } else if (command === CMD.WRTE) {
          // The TV sends this stream's next data after our OKAY: held while the handler is full
          const okay = message(CMD.OKAY, arg1, arg0);
          if (stream.onData(data) === false) stream.held = okay;
          else socket.write(okay);
        } else if (command === CMD.CLSE) {
          streams.delete(arg1);
          stream.onClose();
        }
      }
    });
  });
}

let stage = 'connecting';
const startup = setTimeout(() => {
  console.error(`Startup took over ${STARTUP_MS / 1000} s (${stage}): the TV stopped answering.`);
  process.exit(1);
}, STARTUP_MS);

let sdb;
try {
  sdb = await connectSdb(tvIp);
} catch (error) {
  console.error(
    `Can't reach SDB on ${tvIp}:${SDB_PORT} (${error.message}). Is Developer Mode on and pointing ` +
      'to this machine, and is the Apps2Samsung desktop app closed?'
  );
  process.exit(1);
}
console.log(`Connected to ${sdb.device || tvIp}`);

// A debug launch of a running app never answers: close it first
const packageId = appId.split('.')[0];
stage = 'closing the app';
await sdb.shell(`0 kill ${packageId}`);
stage = 'launching it in debug mode';
const launched = await sdb.shell(`0 debug ${appId}`);
clearTimeout(startup);
const inspectorPort = Number(/port:\s*(\d+)/.exec(launched)?.[1]);
if (!inspectorPort) {
  console.error(`The debug launch of ${appId} failed: ${launched || 'no answer'}`);
  process.exit(1);
}

const server = net.createServer(client => {
  const stream = sdb.open(`tcp:${inspectorPort}`, {
    onData: data => client.write(data),
    onClose: () => client.end(),
    onDrain: () => client.resume(),
  });
  client.on('data', data => {
    if (!stream.write(data)) client.pause();
  });
  client.on('drain', () => stream.resume());
  client.on('close', () => stream.close());
  client.on('error', () => stream.close());
});
server.listen(localPort, '127.0.0.1', () => {
  console.log(`${appId} launched in debug mode; its DevTools are at http://127.0.0.1:${localPort}`);
  console.log('Keep this running while you use them (Ctrl-C stops it).');
});
// Every later client would hang on a dead connection
sdb.onDisconnect = () => {
  console.error('The TV closed the SDB connection: run this again.');
  server.close();
  process.exitCode = 1;
};
process.on('SIGINT', () => {
  server.close();
  sdb.close();
  process.exit(0);
});
