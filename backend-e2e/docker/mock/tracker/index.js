const { createServer } = require('node:http');
const { createSocket } = require('node:dgram');

const announceUrl = 'udp://tracker-mock:6969/announce';
const connectionId = 0x4d696175666c6978n;
const protocolId = 0x41727101980n;

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200).end('ok');
    return;
  }
  if (request.url === '/trackers_best.txt') {
    response.writeHead(200, { 'content-type': 'text/plain' }).end(`${announceUrl}\n`);
    return;
  }
  if (request.url === '/blacklist.txt') {
    response.writeHead(200, { 'content-type': 'text/plain' }).end('');
    return;
  }
  response.writeHead(404).end();
}).listen(8080, '0.0.0.0');

const tracker = createSocket('udp4');
tracker.on('message', (request, peer) => {
  if (request.length < 16) return;

  const action = request.readUInt32BE(8);
  const transactionId = request.readUInt32BE(12);
  if (action === 0 && request.readBigUInt64BE(0) === protocolId) {
    const response = Buffer.alloc(16);
    response.writeUInt32BE(0, 0);
    response.writeUInt32BE(transactionId, 4);
    response.writeBigUInt64BE(connectionId, 8);
    tracker.send(response, peer.port, peer.address);
    return;
  }

  if (action === 2 && request.readBigUInt64BE(0) === connectionId) {
    const hashCount = Math.floor((request.length - 16) / 20);
    if (hashCount < 1) return;
    const response = Buffer.alloc(8 + hashCount * 12);
    response.writeUInt32BE(2, 0);
    response.writeUInt32BE(transactionId, 4);
    for (let index = 0; index < hashCount; index++) {
      const offset = 8 + index * 12;
      response.writeUInt32BE(1, offset); // complete (seeders)
      response.writeUInt32BE(0, offset + 4); // downloaded
      response.writeUInt32BE(0, offset + 8); // incomplete (leechers)
    }
    tracker.send(response, peer.port, peer.address);
  }
});
tracker.bind(6969, '0.0.0.0');
