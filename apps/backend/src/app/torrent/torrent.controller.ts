import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Req,
} from '@nestjs/common';
import { TorrentService } from './torrent.service';
import { GetStreamDto, VideoQuality } from '@miauflix/types';
import { allVideoQualities } from './torrent.const';
import { Request } from 'express';

@Controller('stream')
export class TorrentController {
  constructor(private readonly torrentService: TorrentService) {}

  @Get('movie/:slug/:quality')
  async getMovieTorrent(
    @Param('slug') slug: string,
    @Param('quality') qualityR: string,
    @Req() req: Request
  ): Promise<GetStreamDto> {
    const host = req.headers.host;
    const quality = parseInt(qualityR) as VideoQuality;
    console.log('Searching for movie', slug, quality);
    if (!allVideoQualities.includes(quality)) {
      throw new HttpException(
        `Invalid quality ${quality} must be one of ${allVideoQualities.join(
          ', '
        )}`,
        HttpStatus.BAD_REQUEST
      );
    }
    const stream = await this.torrentService.getStream(slug, quality);
    console.log('Got movie', slug, quality);
    if (typeof host == 'string') {
      const [hostName] = host.split(':');
      return {
        stream: stream.replace('localhost', hostName),
      };
    }
    return { stream };
  }

  @Delete('movie/:slug/:quality')
  async stopMovieTorrent(
    @Param('slug') slug: string,
    @Param('quality') qualityR: string
  ) {
    const quality = parseInt(qualityR) as VideoQuality;
    if (!allVideoQualities.includes(quality)) {
      throw new HttpException(
        `Invalid quality ${quality} must be one of ${allVideoQualities.join(
          ', '
        )}`,
        HttpStatus.BAD_REQUEST
      );
    }
    return this.torrentService.stopStream(slug, quality);
  }
}
