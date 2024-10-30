import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import {
  ChangePriorityForMovieData,
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

function calculatePriority(
  {
    hevc,
    highQuality,
    index,
  }: Omit<GetTorrentFileDataWithIndex, 'movieId' | 'runtime'>,
  basePriority = FROM_LIST_BASE_PRIORITY
) {
  if (hevc) {
    if (highQuality) {
      // This one has the highest importance
      return basePriority + index * 2;
    }
    // Lowest importance
    return basePriority + index * 2 + Math.floor(basePriority * 0.5);
  }
  if (!highQuality) {
    // We still prioritize high quality even if it's potentially slow
    return basePriority + index * 2 + Math.floor(basePriority * 0.1);
  }
  return basePriority + index * 2 + Math.floor(basePriority * 0.2);
}

function calculateJobId({
  hevc,
  highQuality,
  movieId,
}: Omit<GetTorrentFileData, 'runtime'>) {
  return `gtf_${hevc ? 'H' : 'x'}${highQuality ? 'Q' : 'x'}_${movieId}`;
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

  private async changePriorityForMovie({
    movieId,
    priority,
  }: ChangePriorityForMovieData) {
    return Promise.all(
      [
        [true, true],
        [true, false],
        [false, true],
        [false, false],
      ].map(async ([hevc, highQuality]) => {
        const job = await this.torrentQueue.getJob(
          calculateJobId({
            hevc,
            highQuality,
            movieId,
          })
        );
        if (job) {
          job.changePriority({
            priority: calculatePriority(
              {
                hevc,
                highQuality,
                index: 0,
              },
              priority
            ),
          });
        }
      })
    );
  }

  async process(
    job:
      | Job<
          PopulateTorrentQForMovieData,
          void,
          torrentOrchestratorJobs.populateTorrentQForMovie
        >
      | Job<
          ChangePriorityForMovieData,
          void,
          torrentOrchestratorJobs.changePriorityForMovie
        >
  ) {
    switch (job.name) {
      case torrentOrchestratorJobs.populateTorrentQForMovie:
        return await this.populateTorrentQForMovie(job.data);
      case torrentOrchestratorJobs.changePriorityForMovie:
        return await this.changePriorityForMovie(job.data);
    }
  }
}
