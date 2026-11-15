import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { ReactNode } from 'react';

import { ActionGroup } from '../../action-group/ActionGroup';
import { Stack } from '../../layout/Stack';
import { Section } from '../../section/Section';
import type { Space } from '../../tokens';
import * as styles from './formSection.css';

export interface FormSectionProps {
  /** The heading, which names the form. From the feature (i18n). */
  title: string;
  description?: string;
  headingLevel?: 2 | 3;
  /**
   * Called on submit (Enter in a field, the submit Button). The default page load is prevented;
   * validation and requests stay with the feature.
   */
  onSubmit: () => void;
  /** The fields, in reading and focus order: Field controls, Selects, choice controls. */
  children: ReactNode;
  /** Buttons, primary (`type="submit"`) first, laid out by an ActionGroup. */
  actions: ReactNode;
  /** `start` (default) or `end`: where the actions sit under the fields. */
  actionsAlign?: 'start' | 'end';
  /**
   * A Message about the whole form, above the actions: the failure a submit returned, a saved
   * notice. Per-field errors belong to each Field.
   */
  message?: ReactNode;
  /** While submitting: `aria-busy` on the form (the submit Button shows `loading`). */
  busy?: boolean;
  /** Space around the section, a space token. */
  padding?: Space;
  /** The form's navigation group (vertical), for defaults and overrides; generated if absent. */
  navId?: string;
}

/**
 * A form's structure: a Section heading it, the fields stacked, the form's Message and its
 * actions. It owns layout and the submit event only; the feature owns values, validation and
 * requests. Login, setup and provider credentials share it.
 */
export function FormSection({
  title,
  description,
  headingLevel,
  onSubmit,
  children,
  actions,
  actionsAlign = 'start',
  message,
  busy = false,
  padding,
  navId,
}: FormSectionProps) {
  return (
    <FocusGroup id={navId} layout="vertical">
      <Section
        title={title}
        description={description}
        headingLevel={headingLevel}
        padding={padding}
      >
        <form
          className={styles.form}
          noValidate
          aria-busy={busy || undefined}
          onSubmit={event => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Stack gap="lg">{children}</Stack>
          {message && <div className={styles.message}>{message}</div>}
          <div className={styles.actions}>
            <ActionGroup align={actionsAlign} layout="auto">
              {actions}
            </ActionGroup>
          </div>
        </form>
      </Section>
    </FocusGroup>
  );
}
