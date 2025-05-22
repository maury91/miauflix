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
};

export const resetMocks = () => {
  Object.values(mockedTorrentInstance).forEach(fn => {
    if (typeof fn === 'function' && fn.mockReset) {
      fn.mockReset();
    }
  });
};

export default class WebTorrent {
  constructor() {
    return mockedTorrentInstance;
  }
}
