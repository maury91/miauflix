import { IS_TV } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button } from '@shared/ui/button/Button';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
`;

const Dialog = styled.div`
  position: relative;
  transform: scale(${IS_TV ? 0.8 : 600 / 840});
  transform-origin: center;
  box-sizing: border-box;
  width: min(52.5rem, 100%);
  max-height: calc((100dvh - 3rem) * ${1 / (IS_TV ? 0.8 : 600 / 840)});
  overflow-y: auto;
  padding: 5.75rem 3.5rem 2.875rem;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-radius: 1.75rem;
  background:
    radial-gradient(ellipse at top right, rgba(126, 20, 44, 0.16), transparent 55%),
    linear-gradient(125deg, #151b24, #101419 55%, #0d1114);
  box-shadow:
    0 1.5rem 5rem rgba(0, 0, 0, 0.6),
    inset 0 1px rgba(255, 255, 255, 0.04);
  font-family: 'Poppins', sans-serif;

  @media (max-width: 600px) {
    padding: 4.5rem 1.5rem 1.5rem;
    border-radius: 1.25rem;
  }
`;

const CloseButton = styled(Button)`
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  width: 3.25rem;
  min-width: 3.25rem;
  min-height: 3.25rem;
  padding: 0;
  border-radius: 0.625rem;
  color: #fff;
  font-size: 2rem;
  line-height: 1;
`;

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  closeLabel?: string;
}

/**
 * Show a modal that contains focus and restores the previous focus on unmount.
 * Mark content buttons with data-modal-action="0" or "1" for TV navigation.
 * Back, the close button, and overlay clicks call onClose; the caller controls dismissal.
 */
export function Modal({
  children,
  onClose,
  labelledBy,
  describedBy,
  closeLabel = 'Close dialog',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastBottomAction = useRef(0);
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const focusFirstAction = () => {
      actionRefs.current.find(button => button && !button.disabled)?.focus();
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) {
        focusFirstAction();
      }
    };
    actionRefs.current = [
      ...Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>('[data-modal-action]') ?? []
      ).sort((a, b) => Number(a.dataset['modalAction']) - Number(b.dataset['modalAction'])),
      dialogRef.current?.querySelector<HTMLButtonElement>('[data-modal-close]') ?? null,
    ];
    if (!dialogRef.current?.contains(document.activeElement)) focusFirstAction();
    document.addEventListener('focusin', containFocus);
    return () => document.removeEventListener('focusin', containFocus);
  }, [children]);

  const focusAction = (actionIndex: number) => {
    const button = actionRefs.current[actionIndex];
    if (button && !button.disabled) button.focus();
  };
  const navigationRef = useKeyboardNavigation({
    exclusive: true,
    onLeft: event => {
      if (!dialogRef.current?.contains(event.target as Node)) return true;
      const activeIndex = actionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
      if (activeIndex !== 0 && activeIndex !== 1) return false;
      focusAction(activeIndex === 0 ? 1 : 0);
      return true;
    },
    onRight: event => {
      if (!dialogRef.current?.contains(event.target as Node)) return true;
      const activeIndex = actionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
      if (activeIndex !== 0 && activeIndex !== 1) return false;
      focusAction(activeIndex === 0 ? 1 : 0);
      return true;
    },
    onUp: event => {
      if (!dialogRef.current?.contains(event.target as Node)) return true;
      const activeIndex = actionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
      if (activeIndex !== 0 && activeIndex !== 1) return false;
      lastBottomAction.current = activeIndex;
      focusAction(2);
      return true;
    },
    onDown: event => {
      if (!dialogRef.current?.contains(event.target as Node)) return true;
      const activeIndex = actionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
      if (activeIndex !== 2) return false;
      const previous = actionRefs.current[lastBottomAction.current];
      if (previous && !previous.disabled) previous.focus();
      else focusAction(0);
      return true;
    },
    onBack: () => {
      onClose();
      return true;
    },
  });

  const setDialogRef = useCallback(
    (node: HTMLDivElement | null) => {
      dialogRef.current = node;
      navigationRef(node);
    },
    [navigationRef]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const buttons = actionRefs.current.filter((button): button is HTMLButtonElement =>
      Boolean(button && !button.disabled)
    );
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Tab') {
      event.preventDefault();
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <Overlay
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Dialog
        ref={setDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onKeyDown={handleKeyDown}
      >
        <CloseButton data-modal-close color="secondary" aria-label={closeLabel} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </CloseButton>
        {children}
      </Dialog>
    </Overlay>
  );
}
