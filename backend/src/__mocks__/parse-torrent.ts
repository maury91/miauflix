let hash = 'mockHash';

export const mockParseTorrent = jest.fn().mockImplementation((buffer: Buffer) => ({
  infoHash: hash,
  name: 'mockName',
  files: [],
  length: 123456,
  pieces: [],
  pieceLength: 16384,
  announce: [],
  urlList: [],
  createdBy: 'mockCreatedBy',
  creationDate: 1234567890,
  comment: 'mockComment',
  private: false,
  info: {},
  toBuffer: jest.fn().mockReturnValue(buffer),
}));

export const changeParseTorrentHash = (newHash: string) => {
  hash = newHash;
};

export default mockParseTorrent;
