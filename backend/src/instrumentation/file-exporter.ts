import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import * as fs from 'fs';
import * as path from 'path';

export class FileSpanExporter implements SpanExporter {
  private logFile: string;
  private logStream: fs.WriteStream | null = null;

  constructor(logFile?: string) {
    this.logFile = logFile || path.join(process.cwd(), 'traces.log');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getLogStream(): fs.WriteStream {
    if (!this.logStream) {
      this.logStream = fs.createWriteStream(this.logFile, {
        flags: 'a', // Append mode
        encoding: 'utf8',
      });
    }
    return this.logStream;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      const stream = this.getLogStream();

      for (const span of spans) {
        const traceData = {
          timestamp: new Date().toISOString(),
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          name: span.name,
          kind: span.kind,
          startTime: span.startTime,
          endTime: span.endTime,
          duration: span.endTime[0] - span.startTime[0],
          attributes: span.attributes,
          events: span.events,
          status: span.status,
          resource: span.resource.attributes,
        };

        // Write as JSON for easy parsing, with trace ID prominently displayed
        const logLine = `[${traceData.traceId}] ${JSON.stringify(traceData)}\n`;
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
      if (this.logStream) {
        this.logStream.end(() => {
          this.logStream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
