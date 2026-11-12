import { presentError } from '@shared/lib/api-error';
import type { HTMLAttributes, ReactNode } from 'react';
import styled from 'styled-components';

import { PALETTE } from '../tokens';

const Line = styled.span`
  display: block;
`;

const Secondary = styled.span`
  display: block;
  margin-top: 0.35em;
  color: ${PALETTE.text.secondary};
  font-size: 0.85em;
`;

export type ErrorNoticeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
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
 * Inherits the surrounding font so it fits rows, panels and full-page states alike.
 */
export function ErrorNotice({ error, fallback, children, ...props }: ErrorNoticeProps) {
  const presentation = presentError(error, fallback);
  const { message, hint, detail, inConsole } = presentation;
  // A fixable problem is explained by its hint; an id only helps for the rest.
  const errorId = presentation.needsConfiguration ? undefined : presentation.errorId;
  return (
    <span {...props}>
      <Line>{message}</Line>
      {hint && <Secondary>{hint}</Secondary>}
      {detail && (
        <Secondary>
          Server error: <code>{detail}</code>
        </Secondary>
      )}
      {errorId ? (
        <Secondary>
          Error id <code>{errorId}</code> (find it in the server logs). More details in the browser
          console.
        </Secondary>
      ) : (
        !hint && inConsole && <Secondary>More details in the browser console.</Secondary>
      )}
      {children}
    </span>
  );
}
