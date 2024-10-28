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
    console.log('Searching for movie', slug, { useHvec });
    const { stream, streamKey } = await this.torrentService.getStream(
      slug,
      useHvec,
      false
    );
    console.log('Got movie', slug, { useHvec });
    return {
      stream:
        typeof host === 'string'
          ? stream.replace('localhost', host.split(':')[0])
          : stream,
      streamId: streamKey,
    };
  }

  @Delete(':streamId')
  async stopMovieTorrent(@Param('streamId') streamId: string) {
    return this.torrentService.stopStream(streamId);
  }
}
