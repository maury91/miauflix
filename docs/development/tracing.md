# Tracing and Debugging

The backend uses OpenTelemetry for tracing. Traces are written to the filesystem by default and can optionally be sent to Jaeger (OTLP) for a visual UI.

## Enabling tracing

- Set **`ENABLE_TRACING=true`** in your environment or `.env`.
- Optionally set **`TRACE_FILE`** to the directory for trace files (default: `/tmp`). The backend creates:
  - One file per trace: `{TRACE_FILE}/{traceId}.log` (NDJSON, one JSON object per span).
  - An index: `{TRACE_FILE}/index.ndjson` (one line per trace: `traceId`, `type`, `name`, `start`).
- Optionally set **`TRACE_MAX_TRACES`** to cap how many trace files are kept (default: `1000`). Before creating a new trace file, the backend deletes the oldest trace files so only the most recent N remain. Set to `0` to disable pruning (keep all traces).

With tracing disabled, the SDK is not started and there is no overhead.

## Finding traces

- **From logs**: When a scheduled task runs, the scheduler logs the trace ID and trace file path at debug level (e.g. `Trace ID for task 'refreshLists': <id> (trace file: ...)`). Use that path to open the trace file.
- **From the index**: The index lists every trace (HTTP and background tasks) with type (`http` or `task`), name (e.g. task name or HTTP path), and start time. Grep or use the trace CLI.
- **Trace CLI**: From the repo root:
  - `npm run traces -- list [N]` — list the N most recent traces (default 20).
  - `npm run traces -- last <taskName>` — print trace ID and file path for the last run of a task (e.g. `refreshLists`, `syncMovies`).
  - `npm run traces -- show <traceId>` — pretty-print the trace file.
    Set `TRACE_FILE` if your backend uses a different trace directory.

## Adding spans and events in code

- **Service methods**: Use the `@traced('ServiceName')` decorator from `@utils/tracing.util` so each method gets a span.
- **Ad-hoc spans**: Use `withSpan('spanName', async () => { ... }, { 'attr.key': value })` for a child span with attributes.
- **Events on the current span**: Call `TracingUtil.addEvent('eventName', { key: value })` from `@utils/tracing.util` (e.g. “page_fetched” with page number). Only primitive attribute values are supported.

Background tasks (scheduler) get a root span automatically (`task.<taskName>`). Child spans and events (e.g. per-list in list sync) are created with `withSpan` and `TracingUtil.addEvent`.

## OTLP and Jaeger (optional)

To view traces in Jaeger:

**Option A – Docker Compose (recommended)**  
Jaeger is defined in `docker-compose.yml`. When you run `docker compose up`, the backend is configured with `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318` and sends traces to Jaeger automatically. The Jaeger UI port (16686) is bound to **localhost only** so it is not exposed to the internet. From your machine, open the UI at **http://localhost:16686** when running Compose locally, or use an SSH tunnel on a remote server: `ssh -L 16686:localhost:16686 user@your-server` then open http://localhost:16686. Select the service `@miauflix/backend`.

**Option B – Standalone Jaeger**

1. Run Jaeger (e.g. all-in-one in Docker):
   ```bash
   docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
   ```
2. Enable OTLP in the backend:
   - Set **`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`**, or
   - Set **`ENABLE_OTLP=true`** (uses `http://localhost:4318` by default).
3. Open the Jaeger UI at http://localhost:16686 and select the service `@miauflix/backend`.

**Seeing the timeline and span tree**  
The search results page shows one dot per trace (scatter plot). To see the **timeline and nested spans** (e.g. HTTP → auth → service → DB, or task → ListSynchronizer → list.sync), **click a trace** (a dot or a row in the table if you switch view). The trace detail view shows the span hierarchy and duration bars. To see background tasks, use the **Operation** dropdown and pick e.g. `task.refreshLists` or `ListSynchronizer.synchronize`, or remove the **Tags** filter (e.g. `error=true` shows only traces with errors).

**System Architecture**  
The backend sets the `peer.service` attribute on API, database, and cache spans (e.g. `trakt`, `tmdb`, `yts`, `therarbg`, `cache`, `sqlite`). Auto-instrumented HTTP client spans (e.g. from `@opentelemetry/instrumentation-undici`) that have `server.address` but no `peer.service` are enriched at OTLP export time with a `peer.service` derived from the host (e.g. `api.trakt.tv` → `trakt`). Jaeger’s dependency graph is built from **parent–child service relationships** (not from `peer.service` alone). So for each CLIENT span with a peer, the OTLP export pipeline also sends a **synthetic SERVER span** whose resource has that peer as `service.name` and whose parent is the CLIENT span. That makes peers (cache, trakt, tmdb, yts, thermarbg, sqlite) appear as nodes in **System Architecture** and in the trace’s span tree. The **Service** dropdown in Jaeger still only lists services that emit traces (e.g. `@miauflix/backend`); to see the dependency graph, open **System Architecture** (or **Dependencies**) for that service.

Traces are always written to the filesystem when tracing is enabled; OTLP is an additional export. If Jaeger is not running or the endpoint is unreachable:

- The app does not crash: export runs asynchronously and failures are handled inside the exporter and BatchSpanProcessor.
- Logs are not flooded: export errors are not logged on every failure.

You can leave `OTEL_EXPORTER_OTLP_ENDPOINT` or `ENABLE_OTLP` set and start/stop Jaeger at will; the backend remains safe and quiet when the endpoint is down.
