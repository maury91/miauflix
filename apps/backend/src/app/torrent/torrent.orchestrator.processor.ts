import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import {
  GetTorrentFileData,
  PopulateTorrentQForMovieData,
  queues,
  torrentJobs,
  torrentOrchestratorJobs,
} from '../../queues';
import { Job, Queue } from 'bullmq';
import { BulkJobOptions } from 'bullmq/dist/esm/interfaces';
import { TorrentData } from './torrent.data';

type GetTorrentFileDataWithIndex = GetTorrentFileData & { index: number };

const FROM_LIST_BASE_PRIORITY = 1000;

function calculatePriority({
  hevc,
  highQuality,
  index,
}: GetTorrentFileDataWithIndex) {
  if (hevc) {
    if (highQuality) {
      // This one has highest importance
      return FROM_LIST_BASE_PRIORITY + index * 2;
    }
    // Lowest importance
    return FROM_LIST_BASE_PRIORITY + index * 2 + 500;
  }
  if (!highQuality) {
    // We still prioritize high quality even if it's potentially slow
    return FROM_LIST_BASE_PRIORITY + index * 2 + 20;
  }
  return FROM_LIST_BASE_PRIORITY + index * 2 + 40;
}

function calculateJobId({
  hevc,
  highQuality,
  index,
}: GetTorrentFileDataWithIndex) {
  return `gtf_${hevc ? 'H' : 'x'}${highQuality ? 'Q' : 'x'}_${index}`;
}

@Processor(queues.torrentOrchestrator)
export class TorrentOrchestratorProcessor extends WorkerHost {
  constructor(
    private readonly torrentData: TorrentData,
    @InjectQueue(queues.torrent)
    private readonly torrentQueue: Queue<
      GetTorrentFileData,
      void,
      torrentJobs.getTorrentFile
    >
  ) {
    super();
    this.addTorrentsToProcessToQueue();
  }

  @OnWorkerEvent('error')
  onError(job: Job) {
    console.error(`Error processing job ${job.id}`, job.returnvalue);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    console.error(`Failed processing job ${job.id}`, job.failedReason);
  }

  onApplicationBootstrap() {
    this.worker.concurrency = 32;
  }

  private addToTorrentQueue(torrents: GetTorrentFileDataWithIndex[]) {
    return this.torrentQueue.addBulk(
      torrents.map<{
        name: torrentJobs.getTorrentFile;
        data: GetTorrentFileData;
        opts?: BulkJobOptions;
      }>((jobData) => ({
        name: torrentJobs.getTorrentFile,
        data: jobData,
        opts: {
          jobId: calculateJobId(jobData),
          priority: calculatePriority(jobData),
        },
      }))
    );
  }

  async addTorrentsToProcessToQueue() {
    const torrents = await this.torrentData.getTorrentsToProcess();
    const failedJobs = await this.torrentQueue.getJobs(['failed']);

    await Promise.all(
      failedJobs.map(async (job) => {
        await job.remove();
      })
    );
    // index is unknown because it's not from a list
    await this.addToTorrentQueue(
      torrents.map((torrent) => ({ ...torrent, index: 11 }))
    );
  }

  private async populateTorrentQForMovie({
    index,
    movieId,
  }: PopulateTorrentQForMovieData) {
    const torrents = await this.torrentData.getTorrentsToProcessForMovie(
      movieId
    );
    await this.addToTorrentQueue(
      torrents.map((torrent) => ({ ...torrent, index }))
    );
  }

  async process(
    job: Job<
      PopulateTorrentQForMovieData,
      void,
      torrentOrchestratorJobs.populateTorrentQForMovie
    >
  ) {
    switch (job.name) {
      case torrentOrchestratorJobs.populateTorrentQForMovie:
        return await this.populateTorrentQForMovie(job.data);
    }
  }
}
