import type { Attributes } from '@opentelemetry/api';
import { context, type Span, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_OPERATION_NAME,
  ATTR_SERVICE_NAME,
  ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';

/**
 * Tracing utility for creating and managing spans throughout the application
 */
export class TracingUtil {
  private static readonly tracer = trace.getTracer('@miauflix/backend');

  /**
   * Create a span for a service method
   */
  static createServiceSpan(
    serviceName: string,
    methodName: string,
    attributes: Attributes = {}
  ): Span | null {
    if (process.env.ENABLE_TRACING !== 'true') {
      return null;
    }

    const span = this.tracer.startSpan(`${serviceName}.${methodName}`, {
      attributes: {
        [ATTR_SERVICE_NAME]: serviceName,
        'method.name': methodName,
        component: 'service',
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Create a span for database operations
   */
  static createDatabaseSpan(
    operation: string,
    entity: string,
    attributes: Attributes = {}
  ): Span | null {
    if (process.env.ENABLE_TRACING !== 'true') {
      return null;
    }

    const span = this.tracer.startSpan(`db.${operation}`, {
      attributes: {
        [ATTR_DB_OPERATION_NAME]: operation,
        [ATTR_DB_COLLECTION_NAME]: entity,
        component: 'database',
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Create a span for external API calls
   */
  static createApiSpan(
    service: string,
    endpoint: string,
    attributes: Attributes = {}
  ): Span | null {
    if (process.env.ENABLE_TRACING !== 'true') {
      return null;
    }

    const span = this.tracer.startSpan(`api.${service}.${endpoint}`, {
      attributes: {
        'api.service': service,
        [ATTR_URL_FULL]: endpoint,
        component: 'external-api',
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Create a span for file operations
   */
  static createFileSpan(
    operation: string,
    filePath: string,
    attributes: Attributes = {}
  ): Span | null {
    if (process.env.ENABLE_TRACING !== 'true') {
      return null;
    }

    const span = this.tracer.startSpan(`file.${operation}`, {
      attributes: {
        'file.operation': operation,
        'file.path': filePath,
        component: 'file-system',
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Create a span for background tasks
   */
  static createTaskSpan(taskName: string, attributes: Attributes = {}): Span | null {
    if (process.env.ENABLE_TRACING !== 'true') {
      return null;
    }

    const span = this.tracer.startSpan(`task.${taskName}`, {
      attributes: {
        'task.name': taskName,
        component: 'background-task',
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Execute a function within a span context
   */
  static async executeInSpan<T>(
    span: Span,
    fn: () => Promise<T> | T,
    additionalAttributes: Attributes = {}
  ): Promise<T> {
    if (process.env.ENABLE_TRACING !== 'true') {
      return await fn();
    }

    const ctx = trace.setSpan(context.active(), span);

    try {
      // Add any additional attributes
      if (Object.keys(additionalAttributes).length > 0) {
        span.setAttributes(additionalAttributes);
      }

      const result = await context.with(ctx, fn);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Execute a function within a span context (sync version)
   */
  static executeInSpanSync<T>(span: Span, fn: () => T, additionalAttributes: Attributes = {}): T {
    if (process.env.ENABLE_TRACING !== 'true') {
      return fn();
    }

    const ctx = trace.setSpan(context.active(), span);

    try {
      // Add any additional attributes
      if (Object.keys(additionalAttributes).length > 0) {
        span.setAttributes(additionalAttributes);
      }

      const result = context.with(ctx, fn);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Create a child span from the current active span
   */
  static createChildSpan(name: string, attributes: Attributes = {}): Span | null {
    if (process.env.ENABLE_TRACING !== 'true') {
      return null;
    }

    const currentSpan = trace.getSpan(context.active());
    const span = this.tracer.startSpan(
      name,
      {
        attributes,
      },
      currentSpan ? trace.setSpan(context.active(), currentSpan) : undefined
    );

    return span;
  }

  /**
   * Add an event to the current span
   */
  static addEvent(name: string, attributes: Attributes = {}): void {
    if (process.env.ENABLE_TRACING !== 'true') {
      return;
    }

    const currentSpan = trace.getSpan(context.active());
    if (currentSpan) {
      currentSpan.addEvent(name, attributes);
    }
  }

  /**
   * Add attributes to the current span
   */
  static addAttributes(attributes: Attributes): void {
    if (process.env.ENABLE_TRACING !== 'true') {
      return;
    }

    const currentSpan = trace.getSpan(context.active());
    if (currentSpan) {
      currentSpan.setAttributes(attributes);
    }
  }

  /**
   * Record an error in the current span
   */
  static recordError(error: Error): void {
    if (process.env.ENABLE_TRACING !== 'true') {
      return;
    }

    const currentSpan = trace.getSpan(context.active());
    if (currentSpan) {
      currentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      currentSpan.recordException(error);
    }
  }
}

/**
 * Decorator to automatically add tracing to class methods
 */
export function traced<
  This,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Args extends any[],
  Return,
>(serviceName: string) {
  return function (
    _target: This,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Promise<Return>>
  ) {
    const method = descriptor.value;

    descriptor.value = async function (this: This, ...args: Args): Promise<Return> {
      const span = TracingUtil.createServiceSpan(serviceName, propertyName, {
        'method.args': (() => {
          try {
            return JSON.stringify(args);
          } catch {
            return '[Serialization Error]';
          }
        })(),
      });

      if (span) {
        return TracingUtil.executeInSpan(span, () => method!.apply(this, args));
      } else {
        return method!.apply(this, args);
      }
    };
  };
}

/**
 * Decorator to automatically add tracing to database operations
 */
export function tracedDb<
  This,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Args extends any[],
  Return,
>(entity: string) {
  return function (
    _target: This,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Promise<Return>>
  ) {
    const method = descriptor.value;

    descriptor.value = async function (this: This, ...args: Args): Promise<Return> {
      const span = TracingUtil.createDatabaseSpan(propertyName, entity, {
        'method.args': JSON.stringify(args),
      });

      if (span) {
        return TracingUtil.executeInSpan(span, () => method!.apply(this, args));
      } else {
        return method!.apply(this, args);
      }
    };
  };
}

/**
 * Decorator to automatically add tracing to API calls
 */
export function tracedApi<
  This,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Args extends any[],
  Return,
>(service: string) {
  return function (
    _target: This,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Promise<Return>>
  ) {
    const method = descriptor.value;

    descriptor.value = async function (this: This, ...args: Args): Promise<Return> {
      const span = TracingUtil.createApiSpan(service, propertyName, {
        'method.args': JSON.stringify(args),
      });

      if (span) {
        return TracingUtil.executeInSpan(span, () => method!.apply(this, args));
      } else {
        return method!.apply(this, args);
      }
    };
  };
}

/**
 * Utility function to create a span for any operation
 */
export function createSpan(name: string, attributes: Attributes = {}): Span {
  if (process.env.ENABLE_TRACING !== 'true') {
    return trace.getTracer('dummy').startSpan('dummy') as Span;
  }

  return trace.getTracer('@miauflix/backend').startSpan(name, { attributes });
}

/**
 * Utility function to execute code within a span
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes: Attributes = {}
): Promise<T> {
  const span = createSpan(name, attributes);
  return TracingUtil.executeInSpan(span, fn);
}

/**
 * Utility function to execute sync code within a span
 */
export function withSpanSync<T>(name: string, fn: () => T, attributes: Attributes = {}): T {
  const span = createSpan(name, attributes);
  return TracingUtil.executeInSpanSync(span, fn);
}
