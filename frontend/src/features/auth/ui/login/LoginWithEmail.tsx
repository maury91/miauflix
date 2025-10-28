import { useLoginMutation } from '@features/auth/api/auth.api';
import type { FC } from 'react';
import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import { ErrorMessage } from './ErrorMessage';
import { LoginSection, SectionTitle } from './Sections';

const InputGroup = styled.div`
  margin-bottom: 16px;
  width: 100%;
  max-width: 260px;
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

  &:focus {
    outline: none;
    border-color: #db202c;
  }

  &::placeholder {
    color: #888;
  }
`;

const ContinueButton = styled.button`
  width: 100%;
  max-width: 260px;
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
  margin-top: 8px;

  &:hover {
    background-color: #c01e28;
  }

  &:disabled {
    background-color: #666;
    cursor: not-allowed;
  }
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
          />
        </InputGroup>
        <ContinueButton
          type="submit"
          disabled={isEmailLoading || !email.trim() || !password.trim()}
        >
          {isEmailLoading ? 'Signing in...' : 'Continue'}
        </ContinueButton>
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
