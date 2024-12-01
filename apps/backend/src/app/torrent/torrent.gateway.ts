import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { TorrentService } from './torrent.service';
import { ValidateNested } from 'class-validator';
import { from, map } from 'rxjs';

export class SetPriorityMediaDto {
  slug: string;
  positionY: number;
  positionX: number;
}

export class SetPriorityDto {
  @ValidateNested()
  medias: SetPriorityMediaDto[];

  focusX: number;
}

@WebSocketGateway({
  namespace: 'torrent',
  cors: {
    origin: '*',
  },
})
export class TorrentGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly torrentService: TorrentService) {}

  @SubscribeMessage('prioritize')
  handlePrioritize(@MessageBody() { medias }: SetPriorityDto): void {
    console.log(medias);
  }

  @SubscribeMessage('getInfo')
  async handleGetInfo(@MessageBody() streamId: string) {
    const results = await this.torrentService.subscribeToProgress(streamId);
    const event = 'piece-downloaded';

    return from(results).pipe(
      map((piece) => ({
        event,
        piece,
      }))
    );
  }
}
