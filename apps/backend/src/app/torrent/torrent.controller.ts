import { Controller, Delete, Get, Param, Req } from '@nestjs/common';
import { TorrentService } from './torrent.service';
import { GetStreamDto } from '@miauflix/types';
import { Request } from 'express';

@Controller('stream')
export class TorrentController {
  constructor(private readonly torrentService: TorrentService) {}

  // ToDo: Move to Source Controller
  @Get('movie/:slug/:useHvec')
  async getMovieTorrent(
    @Param('slug') slug: string,
    @Param('useHvec') useHvecR: string,
    @Req() req: Request
  ): Promise<GetStreamDto> {
    const host = req.headers.host;
    const useHvec = useHvecR === 'true';
    const { stream, streamKey } = await this.torrentService.getStream(
      slug,
      useHvec,
      false
    );
    return {
      stream:
        typeof host === 'string'
          ? stream.replace('localhost', host.split(':')[0])
          : stream,
      streamId: streamKey,
    };
  }

  @Get(':streamId')
  async getInfo(@Param('streamId') streamId: string) {
    const info = await this.torrentService.getInfo(streamId);
    return {
      progress: info.progress.toString('base64'),
      // decode: new Uint8Array(atob(progress).split("").map(c => c.charCodeAt(0)))
    };
  }

  @Delete(':streamId')
  async stopMovieTorrent(@Param('streamId') streamId: string) {
    return this.torrentService.stopStream(streamId);
  }
}
