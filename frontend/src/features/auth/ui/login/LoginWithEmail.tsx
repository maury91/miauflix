import { useLoginMutation } from '@features/auth/api/auth.api';
import { Button, FormSection, Message, PasswordField, TextField } from '@shared/design-system';
import { TIZEN_IME_DONE } from '@shared/hooks/useKeyboard';
import { t as translate, useT } from '@shared/i18n';
import { useNavigation } from '@shared/navigation';
import type { FC, KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';

import { LOGIN_NAV } from './loginNav';

/** The failure a sign-in returned, in words: the server's message when it gave one. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const { data } = error as { data: unknown };
    if (typeof data === 'string' && data) return data;
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const { message } = data as { message: unknown };
      if (typeof message === 'string' && message) return message;
    }
  }
  return translate('auth.signInFailed');
}

/**
 * Sign in with email and password. A design system form under the page's navigation layer: Down
 * moves through the fields to Continue, Confirm edits a field (opening a TV's keyboard), Right
 * from the password reaches its reveal toggle. The TV keyboard's Done on the email moves on to
 * the password; a failed sign-in brings focus back to the password.
 */
export const LoginWithEmail: FC<{
  /** Show the form's title; without it the title only names the form for assistive technology. */
  showTitle: boolean;
}> = ({ showTitle }) => {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { isLoading, error }] = useLoginMutation();
  const navigation = useNavigation();

  useEffect(() => {
    if (error) navigation.focus(LOGIN_NAV.password);
    // The store's focus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const submit = () => {
    if (email.trim() && password.trim() && !isLoading) login({ email, password });
  };

  const nextOnDone = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.keyCode === TIZEN_IME_DONE) navigation.focus(LOGIN_NAV.password);
  };

  return (
    <FormSection
      navId={LOGIN_NAV.form}
      title={t('auth.signIn')}
      titleHidden={!showTitle}
      onSubmit={submit}
      busy={isLoading}
      message={
        error ? (
          <Message tone="danger" toneLabel={t('common.error')} live="assertive">
            {describeError(error)}
          </Message>
        ) : undefined
      }
      actions={
        <Button
          navId={LOGIN_NAV.submit}
          type="submit"
          fullWidth
          loading={isLoading}
          disabled={!email.trim() || !password.trim()}
        >
          {t('auth.continue')}
        </Button>
      }
    >
      <TextField
        navId={LOGIN_NAV.email}
        id="email"
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={event => setEmail(event.target.value)}
        onKeyDown={nextOnDone}
        placeholder={t('auth.enterEmail')}
        required
        autoComplete="email"
      />
      <PasswordField
        navId={LOGIN_NAV.password}
        id="password"
        label={t('auth.password')}
        showLabel={t('auth.showPassword')}
        hideLabel={t('auth.hidePassword')}
        value={password}
        onChange={event => setPassword(event.target.value)}
        placeholder={t('auth.enterPassword')}
        required
        autoComplete="current-password"
      />
    </FormSection>
  );
};
