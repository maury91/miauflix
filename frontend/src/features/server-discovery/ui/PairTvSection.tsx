import { SETTINGS_PALETTE } from '@shared/config/constants';
import { Alert, Button, FieldLabel, Input } from '@shared/ui';
import type { FormEvent } from 'react';
import { useState } from 'react';
import styled from 'styled-components';

import { useGetTvPairingStatusQuery, usePairTvMutation } from '../api/tv-pairing.api';

const Form = styled.form`
  margin: 4px 0 20px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
`;

const Field = styled.div`
  margin-bottom: 16px;
`;

const Help = styled.p`
  margin: 6px 0 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
  line-height: 1.5;
`;

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

/** Whether the TV can't use `url`: the address of this computer only. */
function isLoopback(url: string): boolean {
  try {
    return LOCAL_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Pair a TV app: the TV shows a code, and this sends the address the TV should use (the one
 * this page was opened at, editable) to it through the backend. Hidden while pairing is off.
 */
export function PairTvSection() {
  const { data: status } = useGetTvPairingStatusQuery();
  const [pairTv, { isLoading, error, isSuccess, reset }] = usePairTvMutation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [address, setAddress] = useState(() => window.location.origin);

  if (!status?.enabled) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void pairTv({ code: code.trim(), url: address.trim() })
      .unwrap()
      .then(() => setCode(''))
      .catch(() => undefined);
  };
  const errorMessage =
    error && 'data' in error && typeof error.data === 'string' ? error.data : 'Pairing failed';

  return (
    <>
      <Button
        appearance="settings"
        color="secondary"
        fullWidth
        aria-expanded={open}
        aria-controls="pair-tv-form"
        onClick={() => setOpen(value => !value)}
      >
        Pair a TV
      </Button>
      {open && (
        <Form id="pair-tv-form" onSubmit={submit} aria-label="Pair a TV">
          <Field>
            <FieldLabel htmlFor="pair-tv-code">Code shown on the TV</FieldLabel>
            <Input
              id="pair-tv-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              placeholder="ABCD EFGH"
              value={code}
              onChange={event => {
                setCode(event.target.value.toUpperCase());
                reset();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pair-tv-address">Address the TV will use</FieldLabel>
            <Input
              id="pair-tv-address"
              type="url"
              autoComplete="off"
              spellCheck={false}
              value={address}
              invalid={isLoopback(address)}
              aria-describedby="pair-tv-address-help"
              onChange={event => setAddress(event.target.value)}
            />
            <Help id="pair-tv-address-help">
              {isLoopback(address)
                ? "The TV can't reach this computer as localhost: use its network address, like http://192.168.1.10:3000."
                : 'The address this page is open at. Change it if the TV reaches the server another way.'}
            </Help>
          </Field>
          {isSuccess && <Alert severity="success">Paired: the TV connects in a few seconds.</Alert>}
          {error && <Alert severity="error">{errorMessage}</Alert>}
          <Button
            type="submit"
            appearance="settings"
            disabled={isLoading || code.replace(/[\s-]/g, '').length !== 8 || !address.trim()}
          >
            {isLoading ? 'Pairing…' : 'Pair'}
          </Button>
        </Form>
      )}
    </>
  );
}
