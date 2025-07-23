declare module 'webtorrent' {
  import { EventEmitter } from 'events';
  // Utility types
  type TorrentId = ArrayBufferView | Buffer | File | FileList | ParsedTorrent | Torrent | string;

  // Additional interfaces for BitField and Request
  interface BitField {
    /** The underlying buffer */
    buffer: Buffer | Uint8Array;
    /** Get bit at index */
    get(index: number): boolean;
    /** Set bit at index */
    set(index: number, value?: boolean): void;
  }

  interface Request {
    piece: number;
    offset: number;
    length: number;
    callback: (err: Error | null, chunk?: Buffer) => void;
  }

  // Configuration interfaces based on actual constructor options
  interface WebTorrentOptions {
    /** Peer ID as string or Uint8Array. Auto-generated if not provided */
    peerId?: ArrayBufferView | string;
    /** Node ID for DHT as string or Uint8Array. Auto-generated if not provided */
    nodeId?: ArrayBufferView | string;
    /** Port for incoming torrent connections (default: 0 = random) */
    torrentPort?: number;
    /** Port for DHT (default: 0 = random) */
    dhtPort?: number;
    /** Tracker options or false to disable */
    tracker?: TrackerOptions | boolean;
    /** Enable Local Service Discovery (default: true) */
    lsd?: boolean;
    /** Enable Peer Exchange (default: true) */
    utPex?: boolean;
    /** Enable UPnP port mapping (default: true, 'permanent' for permanent mapping) */
    natUpnp?: boolean | 'permanent';
    /** Enable NAT-PMP port mapping (default: true) */
    natPmp?: boolean;
    /** Maximum number of connections per torrent (default: 55) */
    maxConns?: number;
    /** Enable uTP protocol (default: true if supported) */
    utp?: boolean;
    /** Create outgoing connections when seeding (default: true) */
    seedOutgoingConnections?: boolean;
    /** Global download speed limit in bytes/sec (-1 = unlimited) */
    downloadLimit?: number;
    /** Global upload speed limit in bytes/sec (-1 = unlimited) */
    uploadLimit?: number;
    /** Enable secure peer connections */
    secure?: boolean;
    /** DHT options or false to disable */
    dht?: DHTOptions | boolean;
    /** Enable web seeds (BEP19) (default: true) */
    webSeeds?: boolean;
    /** Blocklist of IP ranges to block */
    blocklist?: string[] | string;
  }

  interface TrackerOptions {
    /** WebRTC implementation for Node.js */
    wrtc?: unknown;
    /** Additional tracker URLs */
    announce?: string[];
    /** Custom function to get announce parameters */
    getAnnounceOpts?: () => Record<string, number | string>;
    [key: string]: unknown;
  }

  interface DHTOptions {
    /** Node ID for DHT */
    nodeId?: string;
    /** Bootstrap nodes */
    bootstrap?: string[];
  }

  /** Torrent-specific options from actual TorrentOpts JSDoc */
  interface TorrentOptions<StoreOpts extends object = Record<string, unknown>> {
    /** Torrent trackers to use (added to list in .torrent or magnet uri) */
    announce?: string[];
    /** Array of web seeds */
    urlList?: string[];
    /** Folder to download files to (default: /tmp/webtorrent/) */
    path?: string;
    /** If true, store torrent in infoHash folder to prevent collisions (Node.js only) */
    addUID?: boolean;
    /** Custom directory handle for browser file system access */
    rootDir?: FileSystemDirectoryHandle;
    /** Skip verification of existing pieces */
    skipVerify?: boolean;
    /** Preloaded bitfield indicating downloaded pieces */
    bitfield?: ArrayLike<number> | Uint8Array;
    /** Custom chunk store constructor */
    store?: ChunkStoreConstructor<StoreOpts>;
    /** Pre-loaded chunk store instance */
    preloadedStore?: ChunkStore;
    /** Number of pieces to cache in memory (default: 20, 0 = disable) */
    storeCacheSlots?: number;
    /** Delete chunk store when torrent is destroyed */
    destroyStoreOnDestroy?: boolean;
    /** Custom options passed to the store */
    storeOpts?: StoreOpts;
    /** Always choke seeders when seeding (default: true) */
    alwaysChokeSeeders?: boolean;
    /** Custom callback for announce parameters */
    getAnnounceOpts?: () => Record<string, number | string>;
    /** Override torrent privacy setting */
    private?: boolean;
    /** Piece selection strategy */
    strategy?: 'rarest' | 'sequential';
    /** Max simultaneous connections per web seed (default: 4) */
    maxWebConns?: number;
    /** Max upload slots (default: 10, false/0 = disable uploads) */
    uploads?: number | false;
    /** Time between noPeers event checks in seconds (default: 30) */
    noPeersIntervalTime?: number;
    /** Array of UNIX timestamps for file modification times */
    fileModtimes?: number[];
    /** Create torrent with no pieces selected initially */
    deselect?: boolean;
    /** Create torrent in paused state */
    paused?: boolean;
  }

  interface ServerOptions {
    /** Server origin */
    origin?: string;
    /** Server hostname */
    hostname?: string;
    /** Server port */
    port?: number;
    /** Service worker registration for browser server */
    controller?: ServiceWorkerRegistration;
  }

  // Chunk Store interfaces based on actual usage
  interface ChunkStore {
    chunkLength: number;
    length: number;
    get(
      index: number,
      opts: { offset?: number; length?: number },
      cb: (err: Error | null, chunk?: Buffer) => void
    ): void;
    put(index: number, chunk: Buffer, cb: (err: Error | null) => void): void;
    close(cb: (err: Error | null) => void): void;
    destroy(cb: (err: Error | null) => void): void;
  }

  interface ChunkStoreConstructor<StoreOpts extends object = Record<string, unknown>> {
    new (chunkLength: number, opts: StoreOpts): ChunkStore;
  }

  // Parse-torrent compatible interface
  interface ParsedTorrent {
    /** Info hash as hex string */
    infoHash?: string;
    /** Info hash as Buffer */
    infoHashBuffer?: Buffer;
    /** Torrent name */
    name?: string;
    /** Tracker announce URLs */
    announce?: string[];
    /** Web seed URLs */
    urlList?: string[];
    /** File list */
    files?: TorrentFileInfo[];
    /** Total torrent length in bytes */
    length?: number;
    /** Length of each piece except the last */
    pieceLength?: number;
    /** Length of the last piece */
    lastPieceLength?: number;
    /** Concatenated SHA1 hashes of all pieces */
    pieces?: Buffer;
    /** Torrent comment */
    comment?: string;
    /** Creation date */
    created?: Date;
    /** Created by software */
    createdBy?: string;
    /** Text encoding */
    encoding?: string;
    /** Private torrent flag */
    private?: boolean;
    /** Raw info dictionary */
    info?: Record<string, unknown>;
    /** Magnet URI */
    magnetURI?: string;
    /** Complete torrent file buffer */
    torrentFile?: Buffer;
    /** Cross-site request URLs */
    xs?: string[] | string;
    /** Selected file indices (BEP53) */
    so?: number[];
    /** Peer addresses */
    peerAddresses?: string[];
  }

  // File info from parse-torrent
  interface TorrentFileInfo {
    name: string;
    path: string;
    length: number;
    offset?: number;
  }

  // Actual File class methods from the implementation
  interface TorrentFile extends EventEmitter {
    /** File name */
    readonly name: string;
    /** File path within torrent */
    readonly path: string;
    /** File length in bytes */
    readonly length: number;
    /** File offset within torrent */
    readonly offset: number;
    /** Whether file is completely downloaded */
    readonly done: boolean;
    /** Download progress (0-1) */
    readonly progress: number;
    /** File download speed in bytes/sec */
    readonly downloadSpeed: number;
    /** First piece index containing this file */
    readonly _startPiece: number;
    /** Last piece index containing this file */
    readonly _endPiece: number;

    /** Create readable stream for this file */
    createReadStream(opts?: { start?: number; end?: number }): Readable;
    /** Get file contents as Buffer */
    getBuffer(callback: (err: Error | null, buffer?: Buffer) => void): void;
    /** Get file as Blob (browser only) */
    getBlob(callback: (err: Error | null, blob?: Blob) => void): void;
    /** Get Blob URL for file (browser only) */
    getBlobURL(callback: (err: Error | null, url?: string) => void): void;
    /** Append file to DOM element (browser only) */
    appendTo(
      elem: HTMLElement,
      opts?: Record<string, unknown>,
      callback?: (err: Error | null) => void
    ): void;
    /** Render file to DOM element (browser only) */
    renderTo(
      elem: HTMLElement,
      opts?: Record<string, unknown>,
      callback?: (err: Error | null) => void
    ): void;
    /** Select this file for download */
    select(priority?: number): void;
    /** Deselect this file from download */
    deselect(): void;
    /** Check if piece index is part of this file */
    includes(pieceIndex: number): boolean;

    // EventEmitter methods
    on(event: 'done', listener: () => void): this;
    once(event: 'done', listener: () => void): this;

    [Symbol.asyncIterator](opts?: { start?: number; end?: number }): AsyncIterableIterator<Buffer>;
  }

  // Wire interface based on bittorrent-protocol
  interface Wire extends EventEmitter {
    /** Remote peer ID */
    readonly peerId: string;
    /** Connection type */
    readonly type: string;
    /** Remote IP address */
    remoteAddress?: string;
    /** Remote port */
    remotePort?: number;
    /** Bytes uploaded to this peer */
    uploaded: number;
    /** Bytes downloaded from this peer */
    downloaded: number;
    /** Whether this peer is a seeder */
    isSeeder: boolean;
    /** Whether we are choking this peer */
    amChoking: boolean;
    /** Whether this peer is choking us */
    peerChoking: boolean;
    /** Whether we are interested in this peer */
    amInterested: boolean;
    /** Whether this peer is interested in us */
    peerInterested: boolean;
    /** Peer's bitfield */
    peerPieces: BitField;
    /** Outstanding requests to this peer */
    requests: Request[];
    /** Peer's outstanding requests to us */
    peerRequests: Request[];
    /** Extended handshake from peer */
    peerExtendedHandshake: Record<string, unknown>;
    /** Fast extension allowed pieces */
    peerAllowedFastSet: number[];
    /** Whether peer supports fast extension */
    hasFast: boolean;
    /** Extension modules */
    ut_metadata?: unknown;
    ut_pex?: unknown;
    lt_donthave?: unknown;

    /** Get current upload speed in bytes/sec */
    uploadSpeed(): number;
    /** Get current download speed in bytes/sec */
    downloadSpeed(): number;
    /** Add extension to wire */
    use(extension: object): void;
    /** Send handshake */
    handshake(infoHash: Buffer | string, peerId: Buffer | string): void;
    /** Send bitfield message */
    bitfield(bitfield: BitField | Buffer | Uint8Array): void;
    /** Send have message */
    have(index: number): void;
    /** Send have-all message (fast extension) */
    haveAll(): void;
    /** Send have-none message (fast extension) */
    haveNone(): void;
    /** Send interested message */
    interested(): void;
    /** Send not interested message */
    uninterested(): void;
    /** Send choke message */
    choke(): void;
    /** Send unchoke message */
    unchoke(): void;
    /** Send request message */
    request(
      index: number,
      offset: number,
      length: number,
      callback: (err: Error | null, chunk?: Buffer) => void
    ): void;
    /** Send cancel message */
    cancel(index: number, offset: number, length: number): void;
    /** Send port message for DHT */
    port(port: number): void;
    /** Set keep-alive */
    setKeepAlive(enable: boolean): void;
    /** Set timeout */
    setTimeout(ms: number, unref?: boolean): void;
    /** Destroy connection */
    destroy(err?: Error): void;
  }

  // Address info interface
  interface AddressInfo {
    address: string;
    family: string;
    port: number;
  }

  // Server interfaces based on actual implementation
  interface BaseServer extends EventEmitter {
    /** Get server address */
    address(): AddressInfo | null;
    /** Destroy server */
    destroy(callback?: (err?: Error) => void): void;
    /** Start listening */
    listen(port?: number, hostname?: string, callback?: () => void): void;
    /** Close server */
    close(callback?: (err?: Error) => void): void;
  }

  interface NodeServer extends BaseServer {
    // Node.js HTTP server
    server: HTTPServer;
  }

  interface BrowserServer extends BaseServer {
    // Browser service worker server
    controller: ServiceWorkerRegistration;
  }

  // Main Torrent class based on actual implementation
  class Torrent extends EventEmitter {
    /** Torrent info hash as hex string */
    readonly infoHash: string;
    /** Torrent info hash as Buffer */
    readonly infoHashBuffer: Buffer;
    /** Magnet URI for this torrent */
    readonly magnetURI: string;
    /** Complete torrent file as Buffer */
    readonly torrentFile: Buffer | null;
    /** Tracker announce URLs */
    readonly announce: string[];
    /** Web seed URLs */
    readonly urlList: string[];
    /** Files in this torrent */
    readonly files: TorrentFile[];
    /** Torrent name */
    readonly name: string;
    /** Torrent comment */
    readonly comment: string | null;
    /** Creation date */
    readonly created: Date | null;
    /** Created by software */
    readonly createdBy: string | null;
    /** Total torrent length in bytes */
    readonly length: number;
    /** Length of each piece except last */
    readonly pieceLength: number;
    /** Length of the last piece */
    readonly lastPieceLength: number;
    /** Number of connected peers */
    readonly numPeers: number;
    /** Download path */
    readonly path: string;
    /** Whether torrent has metadata and is ready */
    readonly ready: boolean;
    /** Whether torrent is paused */
    readonly paused: boolean;
    /** Whether all pieces are downloaded */
    readonly done: boolean;
    /** Bytes downloaded and verified */
    readonly downloaded: number;
    /** Bytes uploaded to peers */
    readonly uploaded: number;
    /** Bytes received (including unverified) */
    readonly received: number;
    /** Current download speed in bytes/sec */
    readonly downloadSpeed: number;
    /** Current upload speed in bytes/sec */
    readonly uploadSpeed: number;
    /** Download progress (0-1) */
    readonly progress: number;
    /** Share ratio (uploaded/received) */
    readonly ratio: number;
    /** Total number of pieces */
    readonly numPieces: number;
    /** Estimated time remaining in ms */
    readonly timeRemaining: number;
    /** Maximum web seed connections */
    readonly maxWebConns: number;
    /** Connected wires/peers */
    readonly wires: Wire[];
    /** Piece bitfield */
    readonly bitfield: BitField;
    /** Raw torrent metadata */
    readonly metadata: Buffer | null;
    /** Whether torrent is destroyed */
    readonly destroyed: boolean;
    /** Torrent file as Blob (browser only) */
    readonly torrentFileBlob: Blob | null;
    /** WebTorrent client instance */
    readonly client: WebTorrent;

    constructor(torrentId: TorrentId, client: WebTorrent, opts?: TorrentOptions);

    // File selection methods
    /** Select piece range for download */
    select(start: number, end: number, priority?: number, notify?: () => void): void;
    /** Deselect piece range from download */
    deselect(start: number, end: number): void;
    /** Mark piece range as critical (high priority) */
    critical(start: number, end: number): void;

    // Stream methods
    /** Create readable stream for entire torrent */
    createReadStream(opts?: { start?: number; end?: number }): Readable;

    // Control methods
    /** Pause torrent */
    pause(): void;
    /** Resume torrent */
    resume(): void;
    /** Destroy torrent */
    destroy(opts?: { destroyStore?: boolean }, callback?: (err?: Error) => void): void;
    /** Add peer manually */
    addPeer(peer: string | { host: string; port: number }): boolean;
    /** Add web seed */
    addWebSeed(urlOrConn: string | { url: string }): void;
    /** Remove peer */
    removePeer(peer: Wire | string): void;
    /** Rescan files and verify pieces */
    rescanFiles(callback?: (err?: Error) => void): void;

    // Server methods
    /** Create HTTP server for this torrent */
    createServer(opts?: ServerOptions): BrowserServer | NodeServer;

    // Load data methods
    /** Load streams into torrent store */
    load(streams: Readable | Readable[], callback?: (err?: Error) => void): void;

    // Utility methods
    /** Get file modification times (Node.js only) */
    getFileModtimes(callback: (err: Error | null, modtimes?: number[]) => void): void;

    // Event emitter methods with specific event types
    on(event: 'infoHash', listener: () => void): this;
    on(event: 'metadata', listener: () => void): this;
    on(event: 'ready', listener: () => void): this;
    on(event: 'done', listener: () => void): this;
    on(event: 'download', listener: (bytes: number) => void): this;
    on(event: 'upload', listener: (bytes: number) => void): this;
    on(event: 'wire', listener: (wire: Wire, addr?: string) => void): this;
    on(event: 'peer', listener: (peer: string) => void): this;
    on(event: 'invalidPeer', listener: (peer: string) => void): this;
    on(event: 'blockedPeer', listener: (peer: string) => void): this;
    on(event: 'interested', listener: () => void): this;
    on(event: 'uninterested', listener: () => void): this;
    on(event: 'idle', listener: () => void): this;
    on(event: 'verified', listener: (index: number) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'warning', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'seed', listener: () => void): this;
    on(event: 'trackerAnnounce', listener: () => void): this;
    on(event: 'dhtAnnounce', listener: () => void): this;
    on(event: 'noPeers', listener: (source: string) => void): this;
    on(
      event: 'hotswap',
      listener: (oldWire: Wire, newWire: Wire, pieceIndex: number) => void
    ): this;

    once(event: 'infoHash', listener: () => void): this;
    once(event: 'metadata', listener: () => void): this;
    once(event: 'ready', listener: () => void): this;
    once(event: 'done', listener: () => void): this;
    once(event: 'download', listener: (bytes: number) => void): this;
    once(event: 'upload', listener: (bytes: number) => void): this;
    once(event: 'wire', listener: (wire: Wire, addr?: string) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'warning', listener: (err: Error) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: 'seed', listener: () => void): this;
  }

  // Main WebTorrent client class
  export default class WebTorrent extends EventEmitter {
    /** WebRTC support detection */
    static readonly WEBRTC_SUPPORT: boolean;
    /** uTP support detection */
    static readonly UTP_SUPPORT: boolean;
    /** WebTorrent version */
    static readonly VERSION: string;

    /** Client peer ID */
    readonly peerId: string;
    /** Client peer ID as Buffer */
    readonly peerIdBuffer: Buffer;
    /** DHT node ID */
    readonly nodeId: string;
    /** DHT node ID as Buffer */
    readonly nodeIdBuffer: Buffer;
    /** Whether client is destroyed */
    readonly destroyed: boolean;
    /** Whether client is listening for connections */
    readonly listening: boolean;
    /** Whether client is ready */
    readonly ready: boolean;
    /** Torrent port */
    readonly torrentPort: number;
    /** DHT port */
    readonly dhtPort: number;
    /** Tracker configuration */
    readonly tracker: TrackerOptions | boolean;
    /** Local Service Discovery enabled */
    readonly lsd: boolean;
    /** Peer Exchange enabled */
    readonly utPex: boolean;
    /** UPnP NAT traversal enabled */
    readonly natUpnp: boolean | string;
    /** NAT-PMP enabled */
    readonly natPmp: boolean;
    /** All torrents in this client */
    readonly torrents: Torrent[];
    /** Maximum connections per torrent */
    readonly maxConns: number;
    /** uTP protocol enabled */
    readonly utp: boolean;
    /** Create outgoing connections when seeding */
    readonly seedOutgoingConnections: boolean;
    /** Current download speed across all torrents */
    readonly downloadSpeed: number;
    /** Current upload speed across all torrents */
    readonly uploadSpeed: number;
    /** Overall download progress (0-1) */
    readonly progress: number;
    /** Overall share ratio */
    readonly ratio: number;
    /** DHT instance or false if disabled */
    readonly dht: false | { nodeId: string; listening: boolean };
    /** Web seeds enabled */
    readonly enableWebSeeds: boolean;
    /** Blocklist of IP ranges */
    blocked: IPSet | undefined;

    constructor(opts?: WebTorrentOptions);

    // Torrent management
    /** Add torrent from magnet, file, buffer, etc. */
    add<StoreOpts extends object = object>(
      torrentId: TorrentId,
      opts?: TorrentOptions<StoreOpts>,
      ontorrent?: (torrent: Torrent) => void
    ): Torrent;
    add(torrentId: TorrentId, ontorrent?: (torrent: Torrent) => void): Torrent;

    /** Seed files/folders */
    seed(
      input: Array<Buffer | File | string> | Buffer | File | FileList | string,
      opts?: TorrentOptions,
      onseed?: (torrent: Torrent) => void
    ): Torrent;
    seed(
      input: Array<Buffer | File | string> | Buffer | File | FileList | string,
      onseed?: (torrent: Torrent) => void
    ): Torrent;

    /** Get torrent by ID */
    get(torrentId: TorrentId): Promise<Torrent | null>;

    /** Remove torrent */
    remove(
      torrentId: TorrentId,
      opts?: { destroyStore?: boolean },
      callback?: (err?: Error) => void
    ): Promise<void>;
    remove(torrentId: TorrentId, callback?: (err?: Error) => void): Promise<void>;

    // Server methods
    /** Create HTTP server */
    createServer(options?: ServerOptions, force?: 'browser' | 'node'): BrowserServer | NodeServer;

    // Network methods
    /** Get client address info */
    address(): AddressInfo | null;
    /** Set download speed limit */
    throttleDownload(rate: number): boolean | void;
    /** Set upload speed limit */
    throttleUpload(rate: number): boolean | void;

    // Lifecycle
    /** Destroy client */
    destroy(callback?: (err?: Error) => void): void;

    // Events with specific types
    on(event: 'torrent', listener: (torrent: Torrent) => void): this;
    on(event: 'seed', listener: (torrent: Torrent) => void): this;
    on(event: 'add', listener: (torrent: Torrent) => void): this;
    on(event: 'remove', listener: (torrent: Torrent) => void): this;
    on(event: 'ready', listener: () => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: 'download', listener: (bytes: number) => void): this;
    on(event: 'upload', listener: (bytes: number) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;

    once(event: 'torrent', listener: (torrent: Torrent) => void): this;
    once(event: 'seed', listener: (torrent: Torrent) => void): this;
    once(event: 'add', listener: (torrent: Torrent) => void): this;
    once(event: 'remove', listener: (torrent: Torrent) => void): this;
    once(event: 'ready', listener: () => void): this;
    once(event: 'listening', listener: () => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
  }

  // Export all types
  export {
    AddressInfo,
    BrowserServer,
    ChunkStore,
    ChunkStoreConstructor,
    DHTOptions,
    NodeServer,
    ParsedTorrent,
    ServerOptions,
    Torrent,
    TorrentFile,
    TorrentFileInfo,
    TorrentOptions,
    TrackerOptions,
    WebTorrent,
    WebTorrentOptions,
    Wire,
  };
}

// Related module declarations with improved accuracy
declare module 'parse-torrent' {
  import type { ParsedTorrent } from 'webtorrent';

  /** Parse torrent from various input types */
  function parseTorrent(torrentId: TorrentId): Promise<ParsedTorrent>;
  function parseTorrent(
    torrentId: TorrentId,
    callback: (err: Error | null, torrent?: ParsedTorrent) => void
  ): void;

  /** Convert parsed torrent to magnet URI */
  function toMagnetURI(parsedTorrent: ParsedTorrent): string;

  /** Convert parsed torrent to .torrent file buffer */
  function toTorrentFile(parsedTorrent: ParsedTorrent): Buffer;

  /** Parse remote torrent (http/fs/blob) */
  function remote(
    input: TorrentId,
    callback: (err: Error | null, torrent?: ParsedTorrent) => void
  ): void;

  export = parseTorrent;
  export { remote, toMagnetURI, toTorrentFile };
}

declare module 'create-torrent' {
  interface CreateTorrentOptions {
    /** Torrent name */
    name?: string;
    /** Torrent comment */
    comment?: string;
    /** Created by software */
    createdBy?: string;
    /** Private torrent flag */
    private?: boolean;
    /** Piece length in bytes */
    pieceLength?: number;
    /** Tracker announce URLs */
    announce?: string[];
    /** Web seed URLs */
    urlList?: string[];
    /** Add unique identifier to prevent duplicates */
    addUID?: boolean;
  }

  type CreateTorrentInput = Buffer | Buffer[] | File | FileList | string[] | string;

  /** Create .torrent file from input */
  function createTorrent(
    input: CreateTorrentInput,
    opts: CreateTorrentOptions,
    callback: (err: Error | null, torrent?: Buffer) => void
  ): void;

  function createTorrent(
    input: CreateTorrentInput,
    callback: (err: Error | null, torrent?: Buffer) => void
  ): void;

  /** Parse input files for torrent creation */
  function parseInput(
    input: CreateTorrentInput,
    opts: CreateTorrentOptions,
    callback: (err: Error | null, files?: TorrentFileInfo[]) => void
  ): void;

  export = createTorrent;
  export { parseInput };
}

declare module 'fs-chunk-store' {
  import type { ChunkStore } from 'webtorrent';

  class FSChunkStore implements ChunkStore {
    chunkLength: number;
    length: number;

    constructor(
      chunkLength: number,
      opts: {
        path?: string;
        length?: number;
        files?: TorrentFileInfo[];
        name?: string;
        addUID?: boolean;
        rootDir?: FileSystemDirectoryHandle;
      }
    );

    get(
      index: number,
      opts: { offset?: number; length?: number },
      cb: (err: Error | null, chunk?: Buffer) => void
    ): void;
    put(index: number, chunk: Buffer, cb: (err: Error | null) => void): void;
    close(cb: (err: Error | null) => void): void;
    destroy(cb: (err: Error | null) => void): void;
  }

  export = FSChunkStore;
}

declare module 'memory-chunk-store' {
  import type { ChunkStore } from 'webtorrent';

  class MemoryChunkStore implements ChunkStore {
    chunkLength: number;
    length: number;

    constructor(chunkLength: number, opts?: object);

    get(
      index: number,
      opts: { offset?: number; length?: number },
      cb: (err: Error | null, chunk?: Buffer) => void
    ): void;
    put(index: number, chunk: Buffer, cb: (err: Error | null) => void): void;
    close(cb: (err: Error | null) => void): void;
    destroy(cb: (err: Error | null) => void): void;
  }

  export = MemoryChunkStore;
}

declare module 'ip-set' {
  interface IPSetOptions {
    /** Array of IP ranges to initialize with */
    ranges?: Array<{ start: string; end?: string }>;
  }

  class IPSet {
    constructor(options?: IPSetOptions);
    constructor(ranges?: Array<{ start: string; end?: string }>);

    /** Check if an IP address is in the set */
    contains(ip: string): boolean;
    /** Add an IP range to the set */
    add(start: string, end?: string): void;
    /** Remove an IP range from the set */
    remove(start: string, end?: string): void;
    /** Get the number of IP ranges in the set */
    length: number;
  }

  export = IPSet;
}

declare module 'load-ip-set' {
  import type { IPSet } from 'ip-set';

  export interface LoadIPSetOptions {
    /** User agent string for HTTP requests */
    'user-agent'?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Custom headers for HTTP requests */
    headers?: Record<string, string>;
    /** Additional request options */
    [key: string]: Record<string, string> | number | string | undefined;
  }

  interface IPRange {
    start: string;
    end?: string;
  }

  export type LoadIPSetInput = IPRange[] | string[] | string | null | undefined;

  export type LoadIPSetCallback = (error: Error | null, ipSet?: IPSet) => void;

  /**
   * Load an IP set from various sources
   * @param input - File path, HTTP URL, array of IP ranges, or null/undefined
   * @param opts - Options object (optional)
   * @param cb - Callback function
   */
  function loadIPSet(input: LoadIPSetInput, opts: LoadIPSetOptions, cb: LoadIPSetCallback): void;

  /**
   * Load an IP set from various sources (with default options)
   * @param input - File path, HTTP URL, array of IP ranges, or null/undefined
   * @param cb - Callback function
   */
  function loadIPSet(input: LoadIPSetInput, cb: LoadIPSetCallback): void;

  export default loadIPSet;
}

declare module 'bittorrent-tracker' {
  import type { Socket as UDPSocket } from 'dgram';
  import type { EventEmitter } from 'events';
  import type { Server as HTTPServer } from 'http';
  import type { WebSocketServer } from 'ws';

  // Common types
  type InfoHash = Buffer | Uint8Array | string;
  type PeerId = Buffer | Uint8Array | string;
  type AnnounceURL = string[] | string;

  // Peer information interface
  interface Peer {
    /** Peer ID */
    id: string;
    /** Peer IP address */
    ip: string;
    /** Peer port */
    port: number;
    /** Optional socket for WebSocket peers */
    socket?: WebSocket;
  }

  // Client announce options
  interface AnnounceOptions {
    /** Number of bytes uploaded */
    uploaded?: number;
    /** Number of bytes downloaded */
    downloaded?: number;
    /** Number of bytes left to download */
    left?: number;
    /** Number of peers wanted (default: 50) */
    numwant?: number;
    /** Event type for announce */
    event?: 'completed' | 'started' | 'stopped';
    /** Additional custom announce parameters */
    [key: string]: unknown;
  }

  // Scrape response data
  export interface ScrapeData {
    /** Info hash */
    infoHash: string;
    /** Number of complete peers (seeders) */
    complete: number;
    /** Number of incomplete peers (leechers) */
    incomplete: number;
    /** Number of times the torrent has been downloaded */
    downloaded: number;
    /** Announce URL */
    announce: string;
  }

  // Client constructor options
  interface ClientOptions {
    /** Torrent info hash */
    infoHash: InfoHash;
    /** Peer ID */
    peerId: PeerId;
    /** Tracker announce URLs */
    announce: AnnounceURL;
    /** Port for incoming connections */
    port?: number;
    /** Callback to provide additional announce options */
    getAnnounceOpts?: () => Record<string, number | string>;
    /** RTCPeerConnection configuration for WebRTC */
    rtcConfig?: RTCConfiguration;
    /** User-Agent header for HTTP requests */
    userAgent?: string;
    /** WebRTC implementation (useful in Node.js) */
    wrtc?: unknown;
    /** Proxy options for HTTP requests */
    proxyOpts?: {
      /** SOCKS proxy host */
      host?: string;
      /** SOCKS proxy port */
      port?: number;
      /** SOCKS proxy type */
      type?: 4 | 5;
      /** Username for proxy authentication */
      userId?: string;
      /** Password for proxy authentication */
      password?: string;
    };
  }

  // Static scrape options
  interface StaticScrapeOptions {
    /** Info hash or array of info hashes */
    infoHash: InfoHash | InfoHash[];
    /** Tracker announce URL */
    announce: string;
  }

  // BitTorrent tracker client
  class Client extends EventEmitter {
    /** Peer ID as hex string */
    readonly peerId: string;
    /** Info hash as hex string */
    readonly infoHash: string;
    /** Whether client is destroyed */
    readonly destroyed: boolean;

    constructor(opts: ClientOptions);

    /** Send a 'start' announce to trackers */
    start(opts?: AnnounceOptions): void;

    /** Send a 'stop' announce to trackers */
    stop(opts?: AnnounceOptions): void;

    /** Send a 'complete' announce to trackers */
    complete(opts?: AnnounceOptions): void;

    /** Send an 'update' announce to trackers */
    update(opts?: AnnounceOptions): void;

    /** Send a scrape request to trackers */
    scrape(opts?: Record<string, unknown>): void;

    /** Set announce interval for all trackers */
    setInterval(intervalMs: number): void;

    /** Destroy the client and close all tracker connections */
    destroy(callback?: (err?: Error) => void): void;

    /** Static method to scrape a tracker without creating a client instance */
    static scrape(
      opts: StaticScrapeOptions,
      callback: (err: Error | null, data?: Record<string, ScrapeData> | ScrapeData) => void
    ): Client;

    // Events
    on(event: 'peer', listener: (peer: Peer) => void): this;
    on(event: 'scrape', listener: (data: ScrapeData) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'warning', listener: (err: Error) => void): this;
    on(
      event: 'update',
      listener: (data: { announce: string; complete: number; incomplete: number }) => void
    ): this;

    once(event: 'peer', listener: (peer: Peer) => void): this;
    once(event: 'scrape', listener: (data: ScrapeData) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'warning', listener: (err: Error) => void): this;
    once(
      event: 'update',
      listener: (data: { announce: string; complete: number; incomplete: number }) => void
    ): this;
  }

  // Server options interface
  interface ServerOptions {
    /** Announce interval in milliseconds (default: 600000 = 10 minutes) */
    interval?: number;
    /** Trust 'x-forwarded-for' header from reverse proxy */
    trustProxy?: boolean;
    /** HTTP server options or false to disable */
    http?: boolean | object;
    /** UDP server options or false to disable */
    udp?: boolean | object;
    /** WebSocket server options or false to disable */
    ws?: boolean | { noServer?: boolean; [key: string]: unknown };
    /** Enable web-based statistics (default: true) */
    stats?: boolean;
    /** Filter function for allowing/blocking torrents */
    filter?: (
      infoHash: string,
      params: Record<string, unknown>,
      callback: (err?: Error | null) => void
    ) => void;
    /** Peers cache length */
    peersCacheLength?: number;
    /** Peers cache TTL in milliseconds */
    peersCacheTtl?: number;
  }

  // Torrent swarm statistics
  interface SwarmStats {
    /** Number of seeders */
    complete: number;
    /** Number of leechers */
    incomplete: number;
    /** Number of times downloaded */
    downloaded: number;
  }

  // Server-side peer information
  interface ServerPeer {
    /** Peer ID */
    peerId: string;
    /** IP address */
    ip: string;
    /** Port number */
    port: number;
    /** Whether peer is a seeder */
    complete: boolean;
    /** Last announce time */
    lastAnnounce: number;
    /** Bytes uploaded */
    uploaded?: number;
    /** Bytes downloaded */
    downloaded?: number;
    /** Bytes left */
    left?: number;
    /** Client information */
    client: {
      client: string;
      version: string;
    };
  }

  // Swarm interface (used internally by Server)
  interface Swarm {
    /** Info hash */
    readonly infoHash: string;
    /** Number of complete peers (seeders) */
    complete: number;
    /** Number of incomplete peers (leechers) */
    incomplete: number;
    /** LRU cache of peers */
    peers: { get(key: string): ServerPeer | undefined; set(key: string, value: ServerPeer): void };

    /** Handle announce request */
    announce(
      params: Record<string, unknown>,
      callback?: (err?: Error | null, response?: unknown) => void
    ): void;

    /** Handle scrape request */
    scrape(
      params: Record<string, unknown>,
      callback?: (err?: Error | null, response?: unknown) => void
    ): void;
  }

  // BitTorrent tracker server
  class Server extends EventEmitter {
    /** Announce interval in milliseconds */
    readonly intervalMs: number;
    /** Whether server is listening */
    readonly listening: boolean;
    /** Whether server is destroyed */
    readonly destroyed: boolean;
    /** HTTP server instance */
    readonly http: HTTPServer | null;
    /** UDP4 server instance */
    readonly udp4: UDPSocket | null;
    /** UDP6 server instance */
    readonly udp6: UDPSocket | null;
    /** WebSocket server instance */
    readonly ws: WebSocketServer | null;
    /** All torrents being tracked */
    readonly torrents: Record<string, SwarmStats>;

    constructor(opts?: ServerOptions);

    /** Start listening on specified port */
    listen(port?: number, hostname?: string, callback?: () => void): void;

    /** Get server address information */
    address(): { address: string; family: string; port: number } | null;

    /** Close the server */
    close(callback?: (err?: Error) => void): void;

    /** Get torrent swarm */
    getSwarm(infoHash: string): Swarm | null;

    /** Create a new swarm (for advanced usage) */
    createSwarm(infoHash: string): Swarm;

    /** Handle HTTP announce/scrape request */
    onHttpRequest(
      req: {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        connection?: { remoteAddress?: string };
      },
      res: {
        writeHead(statusCode: number, headers?: Record<string, string>): void;
        end(data?: string): void;
      },
      options?: { action?: string; trustProxy?: boolean }
    ): void;

    /** Handle UDP message */
    onUdpRequest(
      msg: Buffer,
      rinfo: { address: string; port: number; family: string; size: number }
    ): void;

    /** Handle WebSocket connection */
    onWebSocketConnection(
      socket: WebSocket & { upgradeReq?: { url?: string; headers?: Record<string, string> } }
    ): void;

    // Events
    on(event: 'start', listener: (peer: ServerPeer, params: Record<string, unknown>) => void): this;
    on(
      event: 'complete',
      listener: (peer: ServerPeer, params: Record<string, unknown>) => void
    ): this;
    on(
      event: 'update',
      listener: (peer: ServerPeer, params: Record<string, unknown>) => void
    ): this;
    on(event: 'stop', listener: (peer: ServerPeer, params: Record<string, unknown>) => void): this;
    on(event: 'warning', listener: (err: Error) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'listening', listener: () => void): this;

    once(
      event: 'start',
      listener: (peer: ServerPeer, params: Record<string, unknown>) => void
    ): this;
    once(
      event: 'complete',
      listener: (peer: ServerPeer, params: Record<string, unknown>) => void
    ): this;
    once(
      event: 'update',
      listener: (peer: ServerPeer, params: Record<string, unknown>) => void
    ): this;
    once(
      event: 'stop',
      listener: (peer: ServerPeer, params: Record<string, unknown>) => void
    ): this;
    once(event: 'warning', listener: (err: Error) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'listening', listener: () => void): this;
  }

  // Default export is Client
  const BitTorrentTracker: typeof Client;
  export default BitTorrentTracker;
  export { Client, Server, Swarm };
}

declare module 'magnet-uri' {
  declare const MagnetUri: MagnetUri.MagnetUri;

  declare namespace MagnetUri {
    interface MagnetUri {
      (uri: string): Instance;
      decode(uri: string): Instance;
      encode(parsed: Instance): string;
    }

    interface Instance {
      dn?: string[] | string | undefined;
      tr?: string[] | string | undefined;
      xs?: string[] | string | undefined;
      as?: string[] | string | undefined;
      ws?: string[] | string | undefined;
      kt?: string[] | undefined;
      ix?: number[] | number | undefined;
      xt?: string[] | string | undefined;
      infoHash?: string | undefined;
      infoHashBuffer?: Buffer | undefined;
      name?: string[] | string | undefined;
      keywords?: string[] | string | undefined;
      announce?: string[] | undefined;
      urlList?: string[] | undefined;
    }
  }

  export default MagnetUri;
}
