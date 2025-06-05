# Scheduler Service Architecture

The Scheduler service provides a robust task scheduling system for automating background operations in the Miauflix backend. It manages the execution of recurring tasks with proper error handling and monitoring capabilities.

## Overview

The [`Scheduler`](../src/services/scheduler.ts) class is a core service that handles the execution of scheduled tasks throughout the application lifecycle. It provides a simple interface for registering tasks with specific intervals and manages their execution with automatic error recovery.

## Architecture

### Core Components

#### Scheduler Class

The main scheduler implementation provides these key methods:

- **`scheduleTask(taskName, interval, task)`** - Registers a new task for periodic execution
- **`cancelTask(taskName)`** - Stops and removes a scheduled task
- **`listTasks()`** - Returns all currently scheduled task names

#### Task Management

Tasks are stored in a `Map<string, NodeJS.Timeout>` where:

- **Key**: Unique task name identifier
- **Value**: Node.js timeout handle for task execution

### Execution Model

The scheduler uses a recursive timeout-based execution model:

1. Task is executed immediately upon scheduling
2. After completion (success or failure), a new timeout is set for the next execution
3. Errors are logged but don't stop the scheduler
4. Tasks continue executing until explicitly cancelled

## Scheduled Tasks

The following tasks are automatically scheduled during application startup in [`app.ts`](../src/app.ts):

### 1. List Synchronization (`refreshLists`)

- **Interval**: 1 hour (3600 seconds)
- **Function**: [`listSynchronizer.synchronize()`](../src/services/media/list.syncronizer.ts)
- **Purpose**: Synchronizes external media lists and updates local cache

### 2. Movie Synchronization (`syncMovies`)

- **Interval**: 1.5 hours (5400 seconds)
- **Function**: [`mediaService.syncMovies()`](../src/services/media/media.service.ts)
- **Purpose**: Updates movie metadata from external APIs

### 3. Incomplete Seasons Sync (`syncIncompleteSeasons`)

- **Interval**: 1 second
- **Function**: [`mediaService.syncIncompleteSeasons()`](../src/services/media/media.service.ts)
- **Purpose**: Continuously processes incomplete TV show seasons

### 4. Movie Source Search (`movieSourceSearch`)

- **Interval**: 0.1 seconds
- **Function**: [`sourceService.searchSourcesForMovies()`](../src/services/source/source.service.ts)
- **Purpose**: High-frequency search for new movie sources from trackers

### 5. Data File Search (`dataFileSearch`)

- **Interval**: 0.2 seconds
- **Function**: [`sourceService.searchTorrentFilesForSources()`](../src/services/source/source.service.ts)
- **Purpose**: Searches for torrent data files, prioritized after source search

### 6. Source Statistics Update (`updateSourcesStats`)

- **Interval**: 2 seconds
- **Function**: [`sourceService.syncStatsForSources()`](../src/services/source/source.service.ts)
- **Purpose**: Updates statistical information for media sources

### 7. Movie Source Resync (`resyncMovieSources`)

- **Interval**: 5 seconds
- **Function**: [`sourceService.resyncMovieSources()`](../src/services/source/source.service.ts)
- **Purpose**: Resyncs movie sources that need updating

## Configuration

### Task Registration

Tasks are registered using the helper `bind` function to properly bind service methods:

```typescript
scheduler.scheduleTask('taskName', intervalInSeconds, bind(serviceInstance, 'methodName', ...args));
```

### Interval Guidelines

Task intervals are designed with priority and resource usage in mind:

- **Critical operations**: Sub-second intervals (0.1-0.2s)
- **Regular maintenance**: Few seconds (2-5s)
- **Background sync**: Minutes to hours (3600-5400s)

## Error Handling

### Automatic Recovery

The scheduler implements robust error handling:

- Exceptions are caught and logged without stopping the scheduler
- Failed tasks are automatically rescheduled for retry
- Each task runs independently - failures don't affect other tasks

### Logging

All task execution is logged with different levels:

- **Debug**: Task start and completion
- **Error**: Task failures with full error details
- **Warn**: Task cancellation issues during shutdown

## Monitoring

### Task Listing

Use `scheduler.listTasks()` to get all currently active tasks:

```typescript
const activeTasks = scheduler.listTasks();
console.log('Active tasks:', activeTasks);
```

### Health Check

The scheduler status can be monitored through the `/status` endpoint which includes various service statuses.

## Graceful Shutdown

During application shutdown, all scheduled tasks are properly cleaned up:

1. Retrieve all active task names using `listTasks()`
2. Cancel each task individually with proper error handling
3. Allow ongoing operations to complete with a 5-second grace period

```typescript
const gracefulShutdown = async (signal: string) => {
  const taskNames = scheduler.listTasks();
  for (const taskName of taskNames) {
    try {
      scheduler.cancelTask(taskName);
    } catch (error) {
      logger.warn('App', `Failed to cancel task ${taskName}:`, error);
    }
  }
};
```

## Best Practices

### Task Design

1. **Idempotent Operations**: Tasks should be safe to retry
2. **Error Boundaries**: Catch and handle expected errors within tasks
3. **Resource Management**: Consider system load when setting intervals
4. **Atomic Operations**: Keep individual task executions focused and atomic

### Performance Considerations

1. **Interval Tuning**: Balance responsiveness with system resources
2. **Task Dependencies**: Avoid scheduling conflicts between related tasks
3. **Database Connections**: Ensure proper connection handling in long-running tasks
4. **Memory Management**: Monitor for memory leaks in recurring operations

## Related Services

- **[Media Service](media-services.md)**: Provides movie and TV show synchronization
- **[Source Service](streaming-services.md)**: Manages torrent source discovery
- **[List Service](media-services.md)**: Handles external media list synchronization

## Troubleshooting

### Common Issues

1. **Task Not Executing**: Check if task was properly registered and not cancelled
2. **High CPU Usage**: Review task intervals and optimize heavy operations
3. **Memory Leaks**: Monitor long-running tasks for proper resource cleanup
4. **Database Locks**: Ensure tasks don't create conflicting database operations

### Debugging

Enable debug logging to monitor task execution:

```typescript
logger.debug('Scheduler', `Executing task: ${taskName}`);
logger.debug('Scheduler', `Task ${taskName} completed successfully`);
```
