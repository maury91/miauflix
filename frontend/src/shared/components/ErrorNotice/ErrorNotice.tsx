import { presentError } from '@shared/lib/api-error';
import type { HTMLAttributes, ReactNode } from 'react';

import * as styles from './errorNotice.css';

export type ErrorNoticeProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children' | 'className' | 'style'
> & {
  /** The failure: an API error, a server error body, or anything else. */
  error: unknown;
  /** Shown when the error carries no message from the server. */
  fallback: string;
  /** Extra content after the explanation, e.g. a retry button. */
  children?: ReactNode;
};

/**
 * Explains a failed request where it failed: the server's message, how to fix it when it can be
 * fixed, otherwise the error id to look for in the server logs and a pointer to the console.
 * Inherits the surrounding font so it fits rows, panels and full-page states alike. It is the
 * content of a design-system `Message` (or a row's description), never a status box of its own.
 */
export function ErrorNotice({ error, fallback, children, ...props }: ErrorNoticeProps) {
  const presentation = presentError(error, fallback);
  const { message, hint, detail, inConsole } = presentation;
  // A fixable problem is explained by its hint; an id only helps for the rest.
  const errorId = presentation.needsConfiguration ? undefined : presentation.errorId;
  return (
    <span {...props}>
      <span className={styles.line}>{message}</span>
      {hint && <span className={styles.secondary}>{hint}</span>}
      {detail && (
        <span className={styles.secondary}>
          Server error: <code>{detail}</code>
        </span>
      )}
      {errorId ? (
        <span className={styles.secondary}>
          Error id <code>{errorId}</code> (find it in the server logs). More details in the browser
          console.
        </span>
      ) : (
        !hint &&
        inConsole && <span className={styles.secondary}>More details in the browser console.</span>
      )}
      {children}
    </span>
  );
}
