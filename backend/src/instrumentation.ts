import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

import { FileSpanExporter } from './instrumentation/file-exporter';

// Check if tracing is enabled via environment variable
const tracingEnabled = process.env.ENABLE_TRACING === 'true';

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
  const traceFile = process.env.TRACE_FILE || '/tmp';

  // Create the file exporter
  const fileExporter = new FileSpanExporter(traceFile);

  // Create the SDK with file-based tracing
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'miauflix-backend',
      [ATTR_SERVICE_VERSION]: '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    spanProcessor: new SimpleSpanProcessor(fileExporter),
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
