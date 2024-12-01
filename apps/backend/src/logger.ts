import { createLogger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { SeqTransport } from '@datalust/winston-seq';

const debug = new DailyRotateFile({
  level: 'debug',
  filename: 'logs/all-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  frequency: '24h',
  maxSize: '20m',
  maxFiles: '3d',
});

const error = new DailyRotateFile({
  level: 'error',
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  frequency: '24h',
  maxSize: '20m',
  maxFiles: '7d',
});

export const logger = createLogger({
  transports: [debug, error],
});

const seqUrl = process.env['SEQ_URL'];
const seqApiKey = process.env['SEQ_API_KEY'];

if (seqUrl && seqApiKey) {
  logger.add(
    new SeqTransport({
      level: 'debug',
      serverUrl: seqUrl,
      apiKey: seqApiKey,
      onError: (e) => {
        console.error(e);
      },
    })
  );
}
