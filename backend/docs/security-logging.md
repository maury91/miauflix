# Security Logging

## Overview

The security logging system provides comprehensive audit trails for security-related events in the application. It tracks user authentication, API access, suspicious activities, and other security events to help with monitoring, debugging, and compliance.

## Features

- **Comprehensive Event Tracking**: Logs various security events including logins, logouts, token operations, API access, and suspicious activities.
- **Severity Levels**: Events are categorized by severity (INFO, WARNING, ERROR, CRITICAL) to help prioritize responses.
- **Detailed Metadata**: Each log entry includes contextual information such as IP address, user agent, and custom metadata.
- **User Association**: Logs can be associated with specific users for tracking user activity.
- **Retention Management**: Automatic cleanup of old logs to manage database size.
- **Query Capabilities**: Ability to query logs by user, event type, severity, and date range.

## Event Types

The system tracks the following event types:

- **Authentication Events**:
  - `LOGIN`: Successful user login
  - `LOGOUT`: User logout
  - `LOGIN_FAILURE`: Failed login attempt
  - `PASSWORD_CHANGE`: User password change
  - `PASSWORD_RESET_REQUEST`: Password reset request
  - `PASSWORD_RESET_COMPLETE`: Password reset completion

- **Token Events**:
  - `TOKEN_REFRESH`: Access token refresh
  - `TOKEN_INVALIDATION`: Token invalidation

- **User Management Events**:
  - `USER_CREATION`: New user creation
  - `USER_UPDATE`: User information update
  - `USER_DELETION`: User deletion
  - `ROLE_CHANGE`: User role change

- **API Events**:
  - `API_ACCESS`: API endpoint access
  - `API_ERROR`: API error occurrence

- **Security Events**:
  - `CONFIGURATION_CHANGE`: Security configuration change
  - `SECURITY_SETTING_CHANGE`: Security setting change
  - `SUSPICIOUS_ACTIVITY`: Detected suspicious activity
  - `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
  - `IP_BLOCKED`: IP address blocked
  - `IP_UNBLOCKED`: IP address unblocked

## Implementation

The security logging system consists of the following components:

1. **AuditLog Entity**: Defines the structure of audit log entries in the database.
2. **AuditLogRepository**: Handles database operations for audit logs.
3. **AuditLogService**: Provides a high-level interface for logging security events.
4. **AuditLogMiddleware**: Automatically logs API access and errors.

## Usage

### Logging Security Events

```typescript
// Example: Logging a login attempt
await auditLogService.logLoginAttempt({
  success: true,
  userId: user.id,
  request: req,
  metadata: { loginMethod: 'password' }
});

// Example: Logging suspicious activity
await auditLogService.logSuspiciousActivity({
  userId: user.id,
  request: req,
  description: 'Multiple failed login attempts',
  metadata: { attemptCount: 5, timeWindow: '5 minutes' }
});
```

### Querying Logs

```typescript
// Get recent logs
const recentLogs = await auditLogService.getRecentLogs(50);

// Get logs for a specific user
const userLogs = await auditLogService.getUserLogs(userId);

// Get logs by event type
const loginLogs = await auditLogService.getLogsByEventType(AuditEventType.LOGIN);

// Get logs by severity
const errorLogs = await auditLogService.getLogsBySeverity(AuditEventSeverity.ERROR);
```

### Cleanup

```typescript
// Clean up logs older than 90 days
const deletedCount = await auditLogService.cleanupOldLogs(90);
```

## Best Practices

1. **Log All Security Events**: Ensure all security-related events are logged, including both successful and failed operations.
2. **Include Context**: Always include relevant context in log entries to aid in troubleshooting.
3. **Set Appropriate Severity**: Use the correct severity level for each event to facilitate proper prioritization.
4. **Regular Review**: Regularly review logs to identify patterns and potential security issues.
5. **Retention Policy**: Implement a retention policy that balances the need for historical data with database performance.
6. **Secure Access**: Restrict access to audit logs to authorized personnel only.
7. **Monitor Log Size**: Monitor the size of the audit log table and adjust retention policies as needed.

## Database Schema

The audit logs are stored in the `audit_logs` table with the following structure:

| Column      | Type         | Description                                |
|-------------|--------------|--------------------------------------------|
| id          | uuid         | Primary key                                |
| event_type  | enum         | Type of security event                     |
| severity    | enum         | Severity level (INFO, WARNING, ERROR, CRITICAL) |
| description | text         | Human-readable description of the event    |
| ip_address  | varchar      | IP address of the client                   |
| user_agent  | varchar      | User agent of the client                   |
| metadata    | jsonb        | Additional contextual information          |
| user_id     | uuid         | Foreign key to users table (nullable)      |
| created_at  | timestamp    | When the event occurred                    |

## Indexes

The following indexes are created to optimize query performance:

- `idx_audit_logs_user_id`: For queries filtering by user
- `idx_audit_logs_event_type`: For queries filtering by event type
- `idx_audit_logs_severity`: For queries filtering by severity
- `idx_audit_logs_created_at`: For date range queries and sorting 