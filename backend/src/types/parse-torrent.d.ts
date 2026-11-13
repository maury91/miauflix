// parse-torrent ships no types. The backend only parses .torrent files and magnet links to read
// their metadata; the torrent engine (and its WebTorrent typings) lives in services/media-load.
declare module 'parse-torrent' {
  type TorrentId = ArrayBufferView | Buffer | ParsedTorrent | string;

  interface TorrentFileInfo {
    name: string;
    path: string;
    length: number;
    offset?: number;
  }

  interface ParsedTorrent {
    /** Info hash as hex string */
    infoHash?: string;
    infoHashBuffer?: Buffer;
    name?: string;
    /** Tracker announce URLs */
    announce?: string[];
    /** Web seed URLs */
    urlList?: string[];
    files?: TorrentFileInfo[];
    /** Total length in bytes */
    length?: number;
    /** Length of each piece except the last */
    pieceLength?: number;
    lastPieceLength?: number;
    /** Concatenated SHA1 hashes of all pieces */
    pieces?: Buffer;
    comment?: string;
    created?: Date;
    createdBy?: string;
    encoding?: string;
    private?: boolean;
    /** Raw info dictionary */
    info?: Record<string, unknown>;
    magnetURI?: string;
    torrentFile?: Buffer;
    /** Cross-site request URLs */
    xs?: string[] | string;
    /** Selected file indices (BEP53) */
    so?: number[];
    peerAddresses?: string[];
  }

  function parseTorrent(torrentId: TorrentId): Promise<ParsedTorrent>;

  function toMagnetURI(parsedTorrent: ParsedTorrent): string;
  function toTorrentFile(parsedTorrent: ParsedTorrent): Buffer;

  // The package is ESM: `export default parseTorrent` plus named exports.
  export default parseTorrent;
  export { toMagnetURI, toTorrentFile };
  export type { ParsedTorrent, TorrentFileInfo, TorrentId };
}
