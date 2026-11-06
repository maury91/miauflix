declare module 'bittorrent-tracker' {
  import type { EventEmitter } from 'node:events';

  export interface ScrapeData {
    announce: string;
    infoHash: string;
    complete: number;
    incomplete: number;
    downloaded: number;
  }

  export class Client extends EventEmitter {
    constructor(options: {
      infoHash: Buffer | string;
      announce: string[];
      peerId: Buffer | string;
      port: number;
    });
    scrape(options?: { infoHash?: Array<Buffer | string> }): void;
    destroy(callback?: (error?: Error) => void): void;
    on(event: 'scrape', listener: (data: ScrapeData) => void): this;
    on(event: 'error' | 'warning', listener: (error: Error) => void): this;
  }
}
