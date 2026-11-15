import { type HTMLAttributes, type ReactNode, useId } from 'react';

import { visuallyHidden } from '../a11y.css';
import type { Space } from '../tokens';
import * as styles from './section.css';

export type SectionProps = Omit<
  HTMLAttributes<HTMLElement>,
  'className' | 'style' | 'children' | 'title'
> & {
  /** The heading, which also names the section. Comes from the feature (i18n). */
  title: string;
  /** Heading level in the page outline. */
  headingLevel?: 2 | 3;
  /**
   * Keep the heading for assistive technology only, when the page already shows what the section
   * is (a sign-in form under a card's own title). It still names the section.
   */
  titleHidden?: boolean;
  /** One or two sentences under the heading. */
  description?: string;
  /** A few actions about the whole section ("Add server", "See all"), at the header's end. */
  actions?: ReactNode;
  /** Space around the section, a space token only; none by default. */
  padding?: Space;
  children?: ReactNode;
};

/**
 * A titled part of a page: heading, optional description and actions, then its content. It is a
 * `section` named by its heading, so assistive technology lists it as a region. Actions sit at the
 * header's end and wrap under the text when there is no room. It holds no service or media state:
 * features pass the content in. Use Surface around it for a card.
 */
export function Section({
  title,
  headingLevel = 2,
  titleHidden = false,
  description,
  actions,
  padding,
  children,
  id: idProp,
  ...props
}: SectionProps) {
  const ownId = useId();
  const id = idProp ?? ownId;
  const headingId = `${id}-heading`;
  const descriptionId = `${id}-description`;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      {...props}
      id={idProp}
      className={styles.section}
      data-padding={padding}
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className={styles.header}>
        <div className={styles.headerText}>
          <Heading id={headingId} className={titleHidden ? visuallyHidden : styles.title}>
            {title}
          </Heading>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}
