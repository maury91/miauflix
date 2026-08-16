import { useCreateAdminMutation } from '@features/setup/api/setup.api';
import { useAppDispatch } from '@store';
import { authSlice } from '@store/slices/auth';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useCallback, useState } from 'react';
import styled from 'styled-components';

const PageContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #0a0d0f;
  color: white;
  font-family: 'Poppins', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const FormCard = styled.div`
  background-color: #0c1214;
  border: 1px solid #191e23;
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 360px;
`;

// const Title = styled.h1`
//   font-size: 24px;
//   font-weight: 400;
//   margin: 0 0 8px 0;
//   color: #ffffff;
// `;

const Subtitle = styled.p`
  font-size: 13px;
  color: #888;
  margin: 0 0 24px 0;
  line-height: 1.5;
`;

const InputGroup = styled.div`
  margin-bottom: 24px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #cccccc;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background-color: #2a2a2a;
  color: white;
  font-size: 14px;
  font-family: 'Poppins', sans-serif;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #db202c;
  }

  &::placeholder {
    color: #888;
  }
`;

const PasswordStrengthBar = styled.div`
  height: 3px;
  background-color: #333;
  border-radius: 0 0 4px 4px;
  overflow: hidden;
  margin-top: -1px;
`;

const PasswordStrengthFill = styled.div<{ $strength: number }>`
  height: 100%;
  width: ${props => props.$strength * 25}%;
  background-color: ${props => {
    if (props.$strength <= 1) return '#db202c';
    if (props.$strength === 2) return '#ff8c00';
    if (props.$strength === 3) return '#a8c23a';
    return '#4caf50';
  }};
  transition:
    width 0.3s ease,
    background-color 0.3s ease;
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 10px 12px;
  background-color: #db202c;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Poppins', sans-serif;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 24px;

  &:hover {
    background-color: #c01e28;
  }

  &:disabled {
    background-color: #444;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.p`
  color: #ff6b6b;
  font-size: 13px;
  margin: 12px 0 0 0;
`;

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

const SetupPage: FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const [createAdmin, { isLoading, error }] = useCreateAdminMutation();
  const dispatch = useAppDispatch();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setValidationError('');

      if (password !== confirmPassword) {
        setValidationError('Passwords do not match');
        return;
      }

      if (password.length < 8) {
        setValidationError('Password must be at least 8 characters');
        return;
      }

      const result = await createAdmin({ email, password });
      if ('data' in result && result.data) {
        // Auto-login: the setup endpoint returns a session, set it directly
        dispatch(authSlice.actions.setSession(result.data.session));
        dispatch(authSlice.actions.setCurrentUser(result.data.user));
      }
    },
    [email, password, confirmPassword, createAdmin, dispatch]
  );

  const passwordStrength = getPasswordStrength(password);
  const apiError = error && 'data' in error && typeof error.data === 'string' ? error.data : null;

  return (
    <PageContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <FormCard>
        <Subtitle>Let's create your admin account!</Subtitle>

        <form onSubmit={handleSubmit}>
          <InputGroup>
            <Label htmlFor="setup-email">Email</Label>
            <Input
              type="email"
              id="setup-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              autoComplete="email"
            />
          </InputGroup>

          <InputGroup>
            <Label htmlFor="setup-password">Password</Label>
            <Input
              type="password"
              id="setup-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              autoComplete="new-password"
            />
            <PasswordStrengthBar>
              <PasswordStrengthFill $strength={passwordStrength} />
            </PasswordStrengthBar>
          </InputGroup>

          <InputGroup>
            <Label htmlFor="setup-confirm-password">Confirm Password</Label>
            <Input
              type="password"
              id="setup-confirm-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
              autoComplete="new-password"
            />
          </InputGroup>

          <SubmitButton
            type="submit"
            disabled={isLoading || !email.trim() || !password.trim() || !confirmPassword.trim()}
          >
            {isLoading ? 'Creating account...' : 'Create Admin Account'}
          </SubmitButton>

          {(validationError || apiError) && (
            <ErrorMessage>{validationError || apiError}</ErrorMessage>
          )}
        </form>
      </FormCard>
    </PageContainer>
  );
};

export default SetupPage;
