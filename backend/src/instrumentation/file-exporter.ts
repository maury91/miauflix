import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import * as fs from 'fs';
import * as path from 'path';

export class FileSpanExporter implements SpanExporter {
  private logStreams: Map<string, { stream: fs.WriteStream; lastAccess: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private logFileBaseName = path.join(process.cwd(), 'traces'),
    private streamTTL = 1000 * 60
  ) {
    this.ensureLogDirectory();
    this.cleanupInterval = setInterval(this.deleteHangingStreams.bind(this), this.streamTTL);
  }

  private getLogFile(traceId: string): string {
    return path.join(this.logFileBaseName, `${traceId}.log`);
  }

  private deleteHangingStreams(): void {
    const now = Date.now();
    for (const [traceId, { lastAccess, stream }] of this.logStreams) {
      if (now - lastAccess > this.streamTTL) {
        stream.end();
        this.logStreams.delete(traceId);
      }
    }
  }

  private ensureLogDirectory(): void {
    const dir = path.dirname(this.getLogFile(''));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getLogStream(traceId: string): fs.WriteStream {
    const logFile = this.getLogFile(traceId);

    if (this.logStreams.has(traceId)) {
      const { stream } = this.logStreams.get(traceId)!;
      this.logStreams.set(traceId, { stream, lastAccess: Date.now() });
      return stream;
    } else {
      try {
        const stream = fs.createWriteStream(logFile, {
          flags: 'a', // Append mode
          encoding: 'utf8',
        });
        stream.on('error', error => {
          console.error('Error writing traces to file:', error);
          stream.end();
          this.logStreams.delete(traceId);
        });
        this.logStreams.set(traceId, { stream, lastAccess: Date.now() });
        return stream;
      } catch (error) {
        console.error('Error creating log stream:', error);
        this.logStreams.delete(traceId);
        throw error;
      }
    }
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      const traceId = spans[0].spanContext().traceId;
      const stream = this.getLogStream(traceId);

      for (const span of spans) {
        const traceData = {
          timestamp: new Date().toISOString(),
          traceId: traceId,
          spanId: span.spanContext().spanId,
          name: span.name,
          kind: span.kind,
          startTime: span.startTime,
          endTime: span.endTime,
          duration:
            (span.endTime[0] - span.startTime[0]) * 1000 +
            (span.endTime[1] - span.startTime[1]) / 1000000,
          attributes: span.attributes,
          events: span.events,
          status: span.status,
          resource: span.resource.attributes,
        };

        // Write as JSON for easy parsing, with trace ID prominently displayed
        const logLine = `${JSON.stringify(traceData)}\n`;
        stream.write(logLine);
      }

      resultCallback({ code: 0 });
    } catch (error) {
      console.error('Error writing traces to file:', error);
      resultCallback({ code: 1, error: error as Error });
    }
  }

  shutdown(): Promise<void> {
    return new Promise(resolve => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      for (const [traceId, { stream }] of this.logStreams) {
        stream.end();
        this.logStreams.delete(traceId);
      }
      resolve();
    });
  }
}
