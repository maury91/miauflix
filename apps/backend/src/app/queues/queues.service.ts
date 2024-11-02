import { Injectable } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { queues } from '@miauflix/types';

@Injectable()
export class QueuesService {
  private movieEventsQueue: QueueEvents;

  constructor() {
    // ToDo: Use configuration for redis connection
    this.movieEventsQueue = new QueueEvents(queues.movie);
  }
}
