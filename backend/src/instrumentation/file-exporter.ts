import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_MAX_TRACES = 1000;

export class FileSpanExporter implements SpanExporter {
  private logStreams: Map<string, { stream: fs.WriteStream; lastAccess: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private logFileBaseName = path.join(process.cwd(), 'traces'),
    private streamTTL = 1000 * 60,
    private maxTraces = DEFAULT_MAX_TRACES
  ) {
    this.ensureLogDirectory();
    this.cleanupInterval = setInterval(this.deleteHangingStreams.bind(this), this.streamTTL);
  }

  private getLogFile(traceId: string): string {
    return path.join(this.logFileBaseName, `${traceId}.log`);
  }

  private getIndexFile(): string {
    return path.join(this.logFileBaseName, 'index.ndjson');
  }

  /**
   * Find the root span in the batch (earliest start time = trace root).
   */
  private getRootSpan(spans: ReadableSpan[]): ReadableSpan {
    return spans.reduce((a, b) =>
      a.startTime[0] * 1e9 + a.startTime[1] <= b.startTime[0] * 1e9 + b.startTime[1] ? a : b
    );
  }

  /**
   * Derive index type and name from root span for discoverability.
   */
  private getIndexEntry(
    traceId: string,
    root: ReadableSpan
  ): { traceId: string; type: 'http' | 'task'; name: string; start: string } {
    const startMs = root.startTime[0] * 1000 + root.startTime[1] / 1e6;
    const start = new Date(startMs).toISOString();
    const name = root.name;
    const type: 'http' | 'task' = name.startsWith('task.') ? 'task' : 'http';
    const indexName = type === 'task' ? name.slice('task.'.length) : name;
    return { traceId, type, name: indexName, start };
  }

  private appendIndexLine(entry: {
    traceId: string;
    type: 'http' | 'task';
    name: string;
    start: string;
  }): void {
    try {
      const indexFile = this.getIndexFile();
      fs.appendFileSync(indexFile, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      console.error('Error writing trace index:', error);
    }
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

  /**
   * Keep only the most recent maxTraces trace files; delete older ones and trim the index.
   * Called before creating a new trace file so the total count stays <= maxTraces.
   */
  private pruneOldTraces(): void {
    if (this.maxTraces <= 0) return;
    const dir = this.logFileBaseName;
    if (!fs.existsSync(dir)) return;

    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.log'))
      .map(f => path.join(dir, f.name));

    if (files.length < this.maxTraces) return;

    const toRemove = files.length - this.maxTraces + 1;
    const withMtime = files.map(f => ({ path: f, mtime: fs.statSync(f).mtimeMs }));
    withMtime.sort((a, b) => a.mtime - b.mtime);
    const toDelete = withMtime.slice(0, toRemove);
    const keptIds = new Set(
      withMtime.slice(toRemove).map(({ path: p }) => path.basename(p, '.log'))
    );

    for (const { path: p } of toDelete) {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        console.error('Error deleting old trace file:', p, err);
      }
    }

    this.rewriteIndexKeeping(keptIds);
  }

  private rewriteIndexKeeping(keptTraceIds: Set<string>): void {
    const indexFile = this.getIndexFile();
    if (!fs.existsSync(indexFile)) return;
    try {
      const text = fs.readFileSync(indexFile, 'utf8');
      const lines = text.trim().split('\n').filter(Boolean);
      const kept: string[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { traceId?: string };
          if (entry.traceId && keptTraceIds.has(entry.traceId)) {
            kept.push(line);
          }
        } catch {
          kept.push(line);
        }
      }
      const tmpFile = `${indexFile}.tmp`;
      fs.writeFileSync(tmpFile, kept.length ? kept.join('\n') + '\n' : '', 'utf8');
      fs.renameSync(tmpFile, indexFile);
    } catch (err) {
      console.error('Error rewriting trace index:', err);
    }
  }

  private getLogStream(traceId: string): fs.WriteStream {
    const logFile = this.getLogFile(traceId);

    if (this.logStreams.has(traceId)) {
      const { stream } = this.logStreams.get(traceId)!;
      this.logStreams.set(traceId, { stream, lastAccess: Date.now() });
      return stream;
    } else {
      this.pruneOldTraces();
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

  /** Only index root-like spans (task.* or HTTP) so we get one index entry per trace. */
  private isRootLikeSpan(span: ReadableSpan): boolean {
    const n = span.name;
    return n.startsWith('task.') || /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/.test(n);
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      const traceId = spans[0].spanContext().traceId;
      const root = this.getRootSpan(spans);
      if (this.isRootLikeSpan(root)) {
        this.appendIndexLine(this.getIndexEntry(traceId, root));
      }

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
