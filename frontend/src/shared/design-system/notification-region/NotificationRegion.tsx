import { useEffect, useRef, useState } from 'react';

import { visuallyHidden } from '../a11y.css';
import { Message, type MessageTone } from '../message/Message';
import * as styles from './notificationRegion.css';

export interface Notification {
  /** Stable identity: a new ID is a new notification, announced once. */
  id: string;
  tone?: MessageTone;
  title?: string;
  /** All text comes from the feature (i18n). */
  body: string;
  /** The tone in words ("Error"), announced before the text. */
  toneLabel?: string;
  /** Interrupts assistive technology: only for failures that block the task. */
  urgent?: boolean;
  /** How long it shows, in ms (5 s by default); `null` keeps it until the feature removes it. */
  duration?: number | null;
}

export interface NotificationRegionProps {
  /** What the notifications are, for assistive technology ("Notifications"). */
  label: string;
  /** The notifications showing, oldest first. The feature adds and removes them. */
  notifications: readonly Notification[];
  /** Called when one's duration ends; the feature removes it from `notifications`. */
  onExpire: (id: string) => void;
  /** Bottom centre by default. */
  placement?: 'top' | 'bottom';
}

const DEFAULT_DURATION = 5000;

const spoken = ({ toneLabel, title, body }: Notification) =>
  [toneLabel, title, body].filter(Boolean).join('. ');

/**
 * Transient messages over the screen. It owns their lifecycle (timers) and how they are announced;
 * Message owns how they look. It never takes focus, so notifications hold no actions: anything a
 * user must act on belongs in the screen or a Dialog. Each one is announced once, politely unless
 * `urgent`, through live regions that exist before it arrives; the visible stack is hidden from
 * assistive technology so nothing is read twice.
 */
export function NotificationRegion({
  label,
  notifications,
  onExpire,
  placement = 'bottom',
}: NotificationRegionProps) {
  // The latest arrivals, all of them: several added in one update are each announced
  const [announced, setAnnounced] = useState<{ polite: Notification[]; urgent: Notification[] }>({
    polite: [],
    urgent: [],
  });
  const seen = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latestExpire = useRef(onExpire);
  useEffect(() => {
    latestExpire.current = onExpire;
  });

  useEffect(() => {
    const present = new Set(notifications.map(notification => notification.id));
    for (const [id, timer] of timers.current) {
      if (!present.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    const arrived = notifications.filter(notification => !seen.current.has(notification.id));
    if (arrived.length > 0) {
      const polite = arrived.filter(notification => !notification.urgent);
      const urgent = arrived.filter(notification => notification.urgent);
      // A region with no new arrival keeps what it last said
      setAnnounced(current => ({
        polite: polite.length > 0 ? polite : current.polite,
        urgent: urgent.length > 0 ? urgent : current.urgent,
      }));
    }
    for (const notification of arrived) {
      seen.current.add(notification.id);
      const time = notification.duration === undefined ? DEFAULT_DURATION : notification.duration;
      if (time !== null) {
        timers.current.set(
          notification.id,
          setTimeout(() => {
            timers.current.delete(notification.id);
            latestExpire.current(notification.id);
          }, time)
        );
      }
    }
    for (const id of seen.current) if (!present.has(id)) seen.current.delete(id);
  }, [notifications]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <>
      <div className={visuallyHidden} role="status" aria-label={label}>
        {announced.polite.map(notification => (
          <span key={notification.id}>{spoken(notification)} </span>
        ))}
      </div>
      <div className={visuallyHidden} role="alert" aria-label={label}>
        {announced.urgent.map(notification => (
          <span key={notification.id}>{spoken(notification)} </span>
        ))}
      </div>
      <div className={styles.region} data-placement={placement} aria-hidden="true">
        {notifications.map(notification => (
          <div key={notification.id} className={styles.item}>
            <Message variant="banner" tone={notification.tone} title={notification.title}>
              {notification.body}
            </Message>
          </div>
        ))}
      </div>
    </>
  );
}
