import { useCreateAdminMutation } from '@features/setup/api/setup.api';
import {
  Button,
  FormSection,
  Message,
  PasswordField,
  Surface,
  TextField,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { FocusScope, NavigationProvider, useNavigation } from '@shared/navigation';
import { useAppDispatch } from '@store';
import { authSlice } from '@store/slices/auth';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useRef, useState } from 'react';

import * as styles from './setupPage.css';

const NAV = {
  email: 'setup-email',
  password: 'setup-password',
  confirm: 'setup-confirm-password',
  submit: 'setup-submit',
} as const;

const MIN_PASSWORD_LENGTH = 8;

const STRENGTH_LABELS = [
  'auth.strength.0',
  'auth.strength.1',
  'auth.strength.2',
  'auth.strength.3',
  'auth.strength.4',
] as const;

function getPasswordStrength(password: string): number {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, score);
}

/** Which field a validation failure belongs to, and what it says. */
type FieldName = 'email' | 'password' | 'confirm';
type ValidationError = { field: FieldName; message: string } | null;

/**
 * The first-run form: create the admin account (password confirmed) and sign in with the session
 * the server returns. The same design system fields and form as the login screen.
 */
function AdminAccountForm() {
  const t = useT();
  const [email, setEmail] = useState('');
  const emailInput = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<ValidationError>(null);
  const [createAdmin, { isLoading, error }] = useCreateAdminMutation();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();

  const handleSubmit = async () => {
    if (isLoading) return;
    let invalid: ValidationError = null;
    if (password !== confirmPassword) {
      invalid = { field: 'confirm', message: t('auth.passwordsDiffer') };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      invalid = {
        field: 'password',
        message: t('auth.passwordTooShort', { count: MIN_PASSWORD_LENGTH }),
      };
    }
    if (!emailInput.current?.validity.valid) {
      invalid = { field: 'email', message: t('auth.invalidEmail') };
    }
    setValidationError(invalid);
    if (invalid) {
      // After a failed submit, focus goes to the field to fix
      navigation.focus(NAV[invalid.field]);
      return;
    }

    const result = await createAdmin({ email, password });
    if ('data' in result && result.data) {
      // Auto-login: the setup endpoint returns a session, set it directly
      dispatch(authSlice.actions.setSession(result.data.session));
      dispatch(authSlice.actions.setCurrentUser(result.data.user));
    }
  };

  const strength = getPasswordStrength(password);
  const apiError = error && 'data' in error && typeof error.data === 'string' ? error.data : null;
  const errorFor = (field: FieldName) =>
    validationError?.field === field ? validationError.message : undefined;

  return (
    <FormSection
      title={t('auth.welcome')}
      description={t('auth.createAdminIntro')}
      onSubmit={() => void handleSubmit()}
      busy={isLoading}
      message={
        apiError ? (
          <Message tone="danger" toneLabel={t('common.error')} live="assertive">
            {apiError}
          </Message>
        ) : undefined
      }
      actions={
        <Button
          navId={NAV.submit}
          type="submit"
          fullWidth
          loading={isLoading}
          disabled={!email.trim() || !password.trim() || !confirmPassword.trim()}
        >
          {t('auth.createAdmin')}
        </Button>
      }
    >
      <TextField
        ref={emailInput}
        navId={NAV.email}
        id="setup-email"
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={event => setEmail(event.target.value)}
        placeholder="admin@example.com"
        required
        error={errorFor('email')}
        autoComplete="email"
      />
      <PasswordField
        navId={NAV.password}
        id="setup-password"
        label={t('auth.password')}
        showLabel={t('auth.showPassword')}
        hideLabel={t('auth.hidePassword')}
        description={
          password
            ? t('auth.strength', { strength: t(STRENGTH_LABELS[strength]!) })
            : t('auth.atLeast', { count: MIN_PASSWORD_LENGTH })
        }
        error={errorFor('password')}
        value={password}
        onChange={event => setPassword(event.target.value)}
        required
        autoComplete="new-password"
      />
      <PasswordField
        navId={NAV.confirm}
        id="setup-confirm-password"
        label={t('auth.confirmPassword')}
        showLabel={t('auth.showConfirmation')}
        hideLabel={t('auth.hideConfirmation')}
        error={errorFor('confirm')}
        value={confirmPassword}
        onChange={event => setConfirmPassword(event.target.value)}
        placeholder={t('auth.repeatPassword')}
        required
        autoComplete="new-password"
      />
    </FormSection>
  );
}

/** Create the initial admin account after password confirmation and store the returned login session. */
const SetupPage: FC = () => (
  <motion.div
    className={styles.page}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.5 }}
  >
    <NavigationProvider>
      <FocusScope initialId={NAV.email}>
        <div className={styles.card}>
          <Surface padding="xl" radius="lg" border>
            <AdminAccountForm />
          </Surface>
        </div>
      </FocusScope>
    </NavigationProvider>
  </motion.div>
);

export default SetupPage;
