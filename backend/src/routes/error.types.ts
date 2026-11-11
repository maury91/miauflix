/**
 * Body of every error the API answers with. `error` and `message` carry the same human readable
 * text (older clients read one or the other); `code` is stable for programs; `errorId` is in the
 * server log next to the full error, so a report can be matched with it.
 */
export interface ApiErrorBody {
  success: false;
  status: number;
  code: string;
  error: string;
  message: string;
  errorId: string;
  /** How to fix it, when the user (or an admin) can. */
  hint?: string;
  /** Set when a service must be configured or repaired before this works. */
  needsConfiguration?: boolean;
  service?: string;
  serviceName?: string;
  /** The underlying error message of an unexpected failure; only sent to signed-in users. */
  detail?: string;
}
