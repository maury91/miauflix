import { randomBytes } from 'node:crypto';

import { logger } from '@logger';
import {
  type SpanContext,
  SpanKind,
  type SpanStatus,
  SpanStatusCode,
  TraceFlags,
} from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

import { ENV } from '@constants';

import { FileSpanExporter } from './instrumentation/file-exporter';

const SYNTHETIC_SCOPE = { name: '@miauflix/backend', version: '1.0.0' };

function randomSpanId(): string {
  return randomBytes(8).toString('hex');
}

/** Build a synthetic SERVER span so Jaeger dependency graph shows peer as a service (parent-child by service). */
function createSyntheticPeerServerSpan(
  clientSpan: ReadableSpan,
  peerService: string
): ReadableSpan {
  const ctx = clientSpan.spanContext();
  const parentCtx: SpanContext = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    traceFlags: ctx.traceFlags,
    traceState: ctx.traceState,
  };
  const newSpanId = randomSpanId();
  const syntheticContext: SpanContext = {
    traceId: ctx.traceId,
    spanId: newSpanId,
    traceFlags: TraceFlags.SAMPLED,
    traceState: ctx.traceState,
  };
  const status: SpanStatus = { code: SpanStatusCode.OK };
  return {
    name: peerService,
    kind: SpanKind.SERVER,
    spanContext: () => syntheticContext,
    parentSpanContext: parentCtx,
    startTime: clientSpan.startTime,
    endTime: clientSpan.endTime,
    status,
    attributes: {},
    links: [],
    events: [],
    duration: clientSpan.duration,
    ended: true,
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: peerService }),
    instrumentationScope: SYNTHETIC_SCOPE,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as ReadableSpan;
}

/** Hostname (or substring) -> peer.service for auto-instrumented HTTP client spans (undici) that lack peer.service */
const HOST_TO_PEER_SERVICE: Array<{ pattern: RegExp | string; service: string }> = [
  { pattern: 'api.trakt.tv', service: 'trakt' },
  { pattern: 'themoviedb.org', service: 'tmdb' },
  { pattern: /yts\.\w+/, service: 'yts' },
  { pattern: /therar\w*\.\w+/, service: 'therarbg' },
];

function peerServiceForSpan(span: ReadableSpan): string | undefined {
  if (span.kind !== SpanKind.CLIENT) return undefined;
  const attrs = span.attributes;
  if (attrs && typeof attrs['peer.service'] === 'string') return undefined; // already set
  const server = attrs && (attrs['server.address'] ?? attrs['url.full']);
  if (typeof server !== 'string') return undefined;
  const host = server
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  for (const { pattern, service } of HOST_TO_PEER_SERVICE) {
    if (typeof pattern === 'string' ? host.includes(pattern) : pattern.test(host)) return service;
  }
  return undefined;
}

/**
 * Enriches CLIENT spans with peer.service and injects synthetic SERVER spans per peer.
 * Jaeger's dependency graph is built from parent-child service relationships; uninstrumented
 * peers (cache, trakt, tmdb, etc.) only appear if we send a span with that service name as
 * the child of our CLIENT span, so we emit one synthetic SERVER span per CLIENT+peer.service.
 */
function wrapWithPeerServiceEnrichment(real: SpanExporter): SpanExporter {
  return {
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
      const syntheticSpans: ReadableSpan[] = [];
      const enriched = spans.map(span => {
        const peerFromHost = peerServiceForSpan(span);
        const peer =
          (typeof (span.attributes && span.attributes['peer.service']) === 'string'
            ? (span.attributes['peer.service'] as string)
            : undefined) ?? peerFromHost;
        if (peer && span.kind === SpanKind.CLIENT) {
          syntheticSpans.push(createSyntheticPeerServerSpan(span, peer));
        }
        if (!peerFromHost) return span;
        const spanContextFn = span.spanContext?.bind?.(span) ?? (() => span.spanContext());
        return {
          ...span,
          spanContext: spanContextFn,
          get attributes() {
            return { ...span.attributes, 'peer.service': peerFromHost };
          },
        } as ReadableSpan;
      });
      const toExport = enriched
        .concat(syntheticSpans)
        .filter(s => typeof (s as { spanContext?: unknown }).spanContext === 'function');
      real.export(toExport, resultCallback);
    },
    shutdown(): Promise<void> {
      return real.shutdown();
    },
    forceFlush: real.forceFlush?.bind(real),
  };
}

/** Wraps OTLP exporter and logs success/failure when DEBUG=Jaeger */
function wrapOtlpExporterWithDebugLogging(real: SpanExporter): SpanExporter {
  const debugEnabled = ENV('DEBUG')?.includes('Jaeger') ?? false;
  return {
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
      real.export(spans, result => {
        if (debugEnabled) {
          if (result.code === ExportResultCode.SUCCESS) {
            logger.debug('Jaeger', `OTLP export success: ${spans.length} span(s)`);
          } else {
            logger.error(
              'Jaeger',
              'OTLP export failed',
              result.error ?? new Error('Unknown OTLP export failure')
            );
          }
        }
        resultCallback(result);
      });
    },
    shutdown(): Promise<void> {
      return real.shutdown();
    },
    forceFlush: real.forceFlush?.bind(real),
  };
}

// Check if tracing is enabled via environment variable
const tracingEnabled = ENV('ENABLE_TRACING');

// OTLP (e.g. Jaeger) is optional: only enable when endpoint is set; failures must not break the app or pollute logs
const otlpEndpoint =
  ENV('OTEL_EXPORTER_OTLP_ENDPOINT') || (ENV('ENABLE_OTLP') ? 'http://localhost:4318' : undefined);

let sdk: NodeSDK | { start: () => void; shutdown: () => Promise<void> };

if (!tracingEnabled) {
  console.log('🔕 Tracing disabled (set ENABLE_TRACING=true to enable)');
  // Create a dummy SDK that does nothing
  sdk = {
    start: () => console.log('Tracing SDK not started (disabled)'),
    shutdown: () => Promise.resolve(),
  };
} else {
  console.log('🔍 Tracing enabled - initializing OpenTelemetry...');

  // Configure the trace file location - use /tmp for Docker containers
  const traceFile = ENV('TRACE_FILE');
  const parsedMaxTraces = Number.parseInt(ENV('TRACE_MAX_TRACES') ?? '1000', 10);
  const maxTraces = Number.isNaN(parsedMaxTraces) ? 1000 : Math.max(0, parsedMaxTraces);

  // File exporter always used when tracing is on (primary sink; no external dependency)
  const fileExporter = new FileSpanExporter(traceFile, undefined, maxTraces);
  const spanProcessors: SpanProcessor[] = [new SimpleSpanProcessor(fileExporter)];

  // Optional OTLP exporter (e.g. Jaeger): only when endpoint set; BatchSpanProcessor so export is async and failures don't propagate
  if (otlpEndpoint) {
    const url = otlpEndpoint.replace(/\/$/, '') + '/v1/traces';
    const otlpExporter = new OTLPTraceExporter({ url });
    const withPeerService = wrapWithPeerServiceEnrichment(otlpExporter);
    const wrappedExporter = wrapOtlpExporterWithDebugLogging(withPeerService);
    spanProcessors.push(new BatchSpanProcessor(wrappedExporter));
    console.log('🔍 OTLP trace export enabled:', url);
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: '@miauflix/backend',
      [ATTR_SERVICE_VERSION]: '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: ENV('NODE_ENV'),
    }),
    spanProcessors,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable file system instrumentation to reduce noise
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        // Disable DNS instrumentation to reduce noise
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => {
        console.log('OpenTelemetry SDK shut down successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('Error shutting down OpenTelemetry SDK:', error);
        process.exit(1);
      });
  });

  process.on('SIGINT', () => {
    sdk
      .shutdown()
      .then(() => {
        console.log('OpenTelemetry SDK shut down successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('Error shutting down OpenTelemetry SDK:', error);
        process.exit(1);
      });
  });
}

export { sdk };
