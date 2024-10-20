import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { TorrentService } from './torrent.service';
import { VideoQuality } from '../jackett/jackett.types';
import { allVideoQualities } from './torrent.const';

@Controller('stream')
export class TorrentController {
  constructor(private readonly torrentService: TorrentService) {}

  @Get('movie/:slug/:quality')
  async getMovieTorrent(
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
    return this.torrentService.getStream(slug, quality);
  }
}
