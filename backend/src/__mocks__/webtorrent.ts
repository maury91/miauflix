console.log('Using webtorrent mock');

export const mockedTorrentInstance = {
  add: jest.fn(),
  remove: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  get: jest.fn(),
  addListener: jest.fn(),
  createServer: jest.fn(),
  removeListener: jest.fn(),
  seed: jest.fn(),
  getMaxListeners: jest.fn(),
  setMaxListeners: jest.fn(),
  eventNames: jest.fn(),
  listeners: jest.fn(),
  listenerCount: jest.fn(),
  prependListener: jest.fn(),
  prependOnceListener: jest.fn(),
  rawListeners: jest.fn(),
  removeAllListeners: jest.fn(),
  throttleDownload: jest.fn(),
  throttleUpload: jest.fn(),
  downloadSpeed: 0,
  progress: 0,
  ratio: 0,
  torrents: [],
  uploadSpeed: 0,
  peerId: 'mock-peer-id',
  peerIdBuffer: Buffer.from('mock-peer-id'),
  nodeId: 'mock-node-id',
  nodeIdBuffer: Buffer.from('mock-node-id'),
  destroyed: false,
  listening: false,
  ready: false,
  torrentPort: 6881,
  dhtPort: 6881,
  tracker: false,
  lsd: false,
  utPex: false,
  natUpnp: false,
  natPmp: false,
  maxConns: 55,
  utp: false,
  seedOutgoingConnections: false,
  dht: false as const,
  enableWebSeeds: false,
  address: jest.fn(),
};

export const resetMocks = () => {
  Object.values(mockedTorrentInstance).forEach(fn => {
    if (typeof fn === 'function' && fn.mockReset) {
      fn.mockReset();
    }
  });
};

export default class WebTorrentMock {
  constructor() {
    return mockedTorrentInstance;
  }
}
