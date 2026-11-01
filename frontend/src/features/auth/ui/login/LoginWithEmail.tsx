import { useLoginMutation } from '@features/auth/api/auth.api';
import { useKeyboard } from '@shared/hooks/useKeyboard';
import { Button, FieldLabel as Label, Input, PALETTE } from '@shared/ui';
import type { FC, RefObject } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { ErrorMessage } from './ErrorMessage';
import { LoginSection, SectionTitle } from './Sections';

import HideIcon from '~icons/mdi/eye-off-outline';
import ShowIcon from '~icons/mdi/eye-outline';

const InputGroup = styled.div`
  margin-bottom: 24px;
  width: 100%;
  max-width: 260px;
`;

/** The password field, with room on its right for the show/hide toggle. */
const PasswordField = styled.div`
  position: relative;

  input {
    padding-right: 44px;
  }
`;

/** Shows or hides the password; inside the field's right end. */
const PasswordToggle = styled.button`
  position: absolute;
  top: 50%;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-top: -17px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: ${PALETTE.text.secondary};
  cursor: pointer;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    color: ${PALETTE.text.primary};
  }

  &:focus-visible {
    outline: none;
    border-color: ${PALETTE.color.brand};
    color: ${PALETTE.text.primary};
  }
`;

/** Tizen's on-screen keyboard reports its Done key with this key code. */
const TIZEN_IME_DONE = 65376;

/**
 * Move focus between the fields and the submit button, for a remote's D-pad: the browser
 * doesn't move focus with the arrow keys, and inside a field they would only move the caret.
 */
function moveFocus(form: HTMLFormElement, from: EventTarget, step: 1 | -1): boolean {
  const controls = Array.from(
    form.querySelectorAll<HTMLElement>('input, button:not([data-beside-field])')
  ).filter((control: HTMLElement) => !(control as HTMLInputElement | HTMLButtonElement).disabled);
  // A button inside a field moves up and down as the field does
  const origin =
    from instanceof HTMLElement && from.dataset['besideField'] !== undefined
      ? from.parentElement?.querySelector('input')
      : from;
  const next = controls[controls.indexOf(origin as HTMLElement) + step];
  if (!next) return false;
  next.focus();
  return true;
}

export const LoginWithEmail: FC<{
  showTitle: boolean;
  /**
   * Keep a TV remote's focus in the form: on the email field at mount, on the password after a
   * failed sign-in, and back on the email field if a remote key finds nothing focused.
   */
  autoFocus?: boolean;
  /** The show-password toggle, for a neighbour that moves the focus back to it. */
  toggleRef?: RefObject<HTMLButtonElement | null>;
  /** Right from the show-password toggle; true when it took the focus. */
  onRightFromToggle?: () => boolean;
}> = ({ showTitle, autoFocus = false, toggleRef: givenToggleRef, onRightFromToggle }) => {
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const ownToggleRef = useRef<HTMLButtonElement>(null);
  const toggleRef = givenToggleRef ?? ownToggleRef;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [login, { isLoading: isEmailLoading, error: emailError }] = useLoginMutation();

  const handleEmailSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (email.trim() && password.trim()) {
        login({ email, password });
      }
    },
    [email, password, login]
  );

  useEffect(() => {
    if (autoFocus) emailRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Continue is disabled while signing in, which takes the focus away from it
  useEffect(() => {
    if (autoFocus && emailError) passwordRef.current?.focus({ preventScroll: true });
  }, [autoFocus, emailError]);

  const recoverFocus = () => {
    if (document.activeElement && document.activeElement !== document.body) return false;
    emailRef.current?.focus({ preventScroll: true });
    return true;
  };
  useKeyboard({
    enabled: autoFocus,
    onUp: recoverFocus,
    onDown: recoverFocus,
    onLeft: recoverFocus,
    onRight: recoverFocus,
    onConfirm: recoverFocus,
  });

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLFormElement>) => {
      const field = passwordRef.current;
      // Right from the password reaches the toggle inside the field (on a TV from anywhere in it,
      // since the caret is moved with the on-screen keyboard); Left comes back
      if (
        event.key === 'ArrowRight' &&
        event.target === field &&
        (autoFocus || field.selectionStart === field.value.length)
      ) {
        toggleRef.current?.focus();
        event.preventDefault();
        return;
      }
      if (event.target === toggleRef.current) {
        if (event.key === 'ArrowLeft') {
          field?.focus();
          event.preventDefault();
          return;
        }
        if (event.key === 'ArrowRight') {
          if (onRightFromToggle?.()) event.preventDefault();
          return;
        }
      }
      const step =
        event.key === 'ArrowDown' || event.keyCode === TIZEN_IME_DONE
          ? 1
          : event.key === 'ArrowUp'
            ? -1
            : null;
      if (step && moveFocus(event.currentTarget, event.target, step)) event.preventDefault();
    },
    [autoFocus, onRightFromToggle, toggleRef]
  );

  return (
    <LoginSection>
      {showTitle && <SectionTitle>Sign in with Email</SectionTitle>}
      <form
        ref={formRef}
        onSubmit={handleEmailSubmit}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          maxWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <InputGroup>
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailRef}
            type="email"
            id="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            autoComplete="email"
          />
        </InputGroup>
        <InputGroup>
          <Label htmlFor="password">Password</Label>
          <PasswordField>
            <Input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
            <PasswordToggle
              ref={toggleRef}
              type="button"
              data-beside-field
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((shown: boolean) => !shown)}
            >
              {showPassword ? <HideIcon aria-hidden="true" /> : <ShowIcon aria-hidden="true" />}
            </PasswordToggle>
          </PasswordField>
        </InputGroup>
        <Button
          fullWidth
          type="submit"
          disabled={isEmailLoading || !email.trim() || !password.trim()}
        >
          {isEmailLoading ? 'Signing in...' : 'Continue'}
        </Button>
        {emailError && (
          <ErrorMessage>
            Error:{' '}
            {typeof emailError === 'object' && 'data' in emailError
              ? JSON.stringify(emailError.data)
              : 'Login failed'}
          </ErrorMessage>
        )}
      </form>
    </LoginSection>
  );
};
