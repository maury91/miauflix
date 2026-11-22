import { IconButton } from '@shared/design-system';
import type { ReactNode } from 'react';

import * as styles from './playerSheet.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import CloseIcon from '~icons/mdi/close';

/** A side sheet's header: its icon and title, and the close button. */
export function SheetHeader({
  icon,
  title,
  closeLabel,
  closeNavId,
  onClose,
}: {
  icon: ReactNode;
  title: string;
  closeLabel: string;
  closeNavId: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.header}>
      <span className={styles.headerIcon} aria-hidden="true">
        {icon}
      </span>
      {/* The dialog is named by its title already */}
      <span className={styles.headerTitle} aria-hidden="true">
        {title}
      </span>
      <IconButton navId={closeNavId} label={closeLabel} icon={<CloseIcon />} onClick={onClose} />
    </div>
  );
}

/** A drill-in view's heading: Back, then the view's title. */
export function ViewHeading({
  title,
  backLabel,
  backNavId,
  onBack,
}: {
  title: string;
  backLabel: string;
  backNavId: string;
  onBack: () => void;
}) {
  return (
    <div className={styles.viewHeading}>
      <IconButton navId={backNavId} label={backLabel} icon={<ArrowLeftIcon />} onClick={onBack} />
      <span className={styles.viewTitle}>{title}</span>
    </div>
  );
}

/** A titled part of a sheet: an icon, a title and a description, then its content. */
export function Part({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.part} aria-label={title}>
      <div className={styles.partHeading}>
        <SheetLead icon={icon} />
        <span className={styles.partText}>
          <span className={styles.partTitle}>{title}</span>
          <span className={styles.partDescription}>{description}</span>
        </span>
      </div>
      {children}
    </section>
  );
}

/** An icon at the start of a row, as wide as a radio's indicator column. */
export function SheetLead({ icon }: { icon: ReactNode }) {
  return (
    <span className={styles.lead} aria-hidden="true">
      {icon}
    </span>
  );
}
