import { useLoginMutation } from '@features/auth/api/auth.api';
import { Button, FieldLabel as Label, Input } from '@shared/ui';
import type { FC } from 'react';
import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import { ErrorMessage } from './ErrorMessage';
import { LoginSection, SectionTitle } from './Sections';

const InputGroup = styled.div`
  margin-bottom: 24px;
  width: 100%;
  max-width: 260px;
`;

export const LoginWithEmail: FC<{ showTitle: boolean }> = ({ showTitle }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    <LoginSection>
      {showTitle && <SectionTitle>Sign in with Email</SectionTitle>}
      <form
        onSubmit={handleEmailSubmit}
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
          <Input
            type="password"
            id="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
          />
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
