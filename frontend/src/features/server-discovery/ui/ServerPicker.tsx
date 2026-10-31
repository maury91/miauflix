import { formatCode } from '@features/auth/lib/formatCode';
import { formatTimeRemaining } from '@features/auth/lib/formatTimeRemaining';
import { TV_PAIRING_URL } from '@shared/config/constants';
import { useKeyboard } from '@shared/hooks/useKeyboard';
import { Button, FieldLabel, Input } from '@shared/ui';
import type { FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { connectTvServer } from '../lib/connect';
import { createTvPairing, pollTvPairing, type TvPairing } from '../lib/pairing';
import { probeServer } from '../lib/probe';
import { getTvIpAddress, scanSubnet } from '../lib/scan';
import { displayServerAddress, normalizeServerAddress } from '../lib/server-address';

/** Tizen's on-screen keyboard reports its Done key with this key code. */
const TIZEN_IME_DONE = 65376;
/** How often an unreachable last server is tried again; it reconnects once it answers. */
const LAST_SERVER_RETRY_MS = 10_000;

const Page = styled.main`
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background-color: #0a0d0f;
  color: #ffffff;
  font-family: 'Poppins', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  box-sizing: border-box;
`;

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 400;
  text-align: center;
`;

const Subtitle = styled.p`
  margin: 0 0 32px;
  color: #9aa3ab;
  font-size: 16px;
  text-align: center;
`;

const Columns = styled.div`
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 960px;
`;

const Section = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 280px;
  margin: 0 12px;
  padding: 24px;
  background-color: #0c1214;
  border: 1px solid #191e23;
  border-radius: 16px;
  box-sizing: border-box;
`;

const SectionTitle = styled.h2`
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 400;
`;

const Hint = styled.p`
  margin: 0 0 16px;
  color: #9aa3ab;
  font-size: 15px;
  line-height: 1.5;
  text-align: center;
`;

const Code = styled.div`
  margin: 8px 0 16px;
  font-family: 'Courier New', monospace;
  font-size: 48px;
  letter-spacing: 6px;
  white-space: nowrap;
`;

const ServerList = styled.ul`
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  width: 100%;

  li + li {
    margin-top: 8px;
  }
`;

const ManualForm = styled.form`
  display: flex;
  align-items: flex-end;
  width: 100%;
  max-width: 936px;
  margin-top: 24px;

  > div {
    flex: 1;
    margin-right: 12px;
  }
`;

const ErrorText = styled.p`
  min-height: 22px;
  margin: 12px 0 0;
  color: #ff6b7f;
  font-size: 15px;
  text-align: center;
`;

/** The pairing code, renewed as it expires; `onPaired` gets the address someone entered. */
function usePairingCode(onPaired: (url: string) => void) {
  const [pairing, setPairing] = useState<TvPairing | null>(null);
  const [failed, setFailed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [generation, setGeneration] = useState(0);
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  useEffect(() => {
    if (!TV_PAIRING_URL) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFailed(false);
    createTvPairing(TV_PAIRING_URL)
      .then(created => {
        if (cancelled) return;
        setPairing(created);
        const poll = async () => {
          try {
            const result = await pollTvPairing(TV_PAIRING_URL, created);
            if (cancelled) return;
            if (result.status === 'paired') {
              onPairedRef.current(result.server.url);
              return;
            }
            if (result.status === 'expired') {
              setGeneration(value => value + 1);
              return;
            }
          } catch {
            // Offline for a moment: keep polling until the code expires
          }
          if (!cancelled) timer = setTimeout(poll, created.pollInterval * 1000);
        };
        timer = setTimeout(poll, created.pollInterval * 1000);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [generation]);

  useEffect(() => {
    if (!pairing) return undefined;
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(interval);
        setGeneration(value => value + 1);
      }
    };
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [pairing]);

  const renew = useCallback(() => setGeneration(value => value + 1), []);
  return { pairing, failed, secondsLeft, renew };
}

/** The servers on the TV's network, found as they answer; `rescan` starts over. */
function useNetworkScan() {
  const [found, setFound] = useState<string[]>([]);
  const [scanning, setScanning] = useState(true);
  const [noNetwork, setNoNetwork] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setScanning(true);
    setNoNetwork(false);
    setFound([]);
    getTvIpAddress()
      .then(ip => {
        if (!ip) {
          setNoNetwork(true);
          return [];
        }
        return scanSubnet(ip, {
          signal: controller.signal,
          onFound: url => {
            if (!controller.signal.aborted) setFound(current => [...current, url]);
          },
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setScanning(false);
      });
    return () => controller.abort();
  }, [generation]);

  const rescan = useCallback(() => setGeneration(value => value + 1), []);
  return { found, scanning, noNetwork, rescan };
}

/** Move the focus through the page's controls for a remote's D-pad, in page order. */
function moveFocus(container: HTMLElement, from: EventTarget, step: 1 | -1): boolean {
  const controls = Array.from(
    container.querySelectorAll<HTMLElement>('input, button:not([disabled])')
  );
  const next = controls[controls.indexOf(from as HTMLElement) + step];
  if (!next) return false;
  next.focus();
  return true;
}

export interface ServerPickerProps {
  /** The server the TV used last, which didn't answer at startup. */
  lastServer?: string;
}

/**
 * Shown on the TV until it has a server: by pairing code (when packaged with a pairing service),
 * among the servers a scan of the local network finds, or by typing the address.
 */
export function ServerPicker({ lastServer }: ServerPickerProps) {
  const pageRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (url: string) => {
    setConnecting(url);
    setError(null);
    if (await probeServer(url)) {
      connectTvServer(url);
      return;
    }
    setConnecting(null);
    setError(`No Miauflix server answers at ${displayServerAddress(url)}`);
  }, []);

  const {
    pairing,
    failed: pairingFailed,
    secondsLeft,
    renew,
  } = usePairingCode(url => {
    void connect(url).then(() => renew());
  });
  const { found, scanning, noNetwork, rescan } = useNetworkScan();

  // The last server may only be restarting: connect as soon as it is back
  useEffect(() => {
    if (!lastServer) return undefined;
    let stopped = false;
    const interval = setInterval(() => {
      void probeServer(lastServer).then(up => {
        if (up && !stopped) connectTvServer(lastServer);
      });
    }, LAST_SERVER_RETRY_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [lastServer]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // The first server found takes the focus while nothing was typed yet
  const firstFoundRef = useRef<HTMLButtonElement>(null);
  const firstFound = found[0];
  useEffect(() => {
    if (firstFound && document.activeElement === inputRef.current && !inputRef.current?.value) {
      firstFoundRef.current?.focus({ preventScroll: true });
    }
  }, [firstFound]);

  const recoverFocus = () => {
    if (document.activeElement && document.activeElement !== document.body) return false;
    inputRef.current?.focus({ preventScroll: true });
    return true;
  };
  useKeyboard({
    onUp: recoverFocus,
    onDown: recoverFocus,
    onLeft: recoverFocus,
    onRight: recoverFocus,
    onConfirm: recoverFocus,
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const inInput = event.target === inputRef.current;
    const step =
      event.key === 'ArrowDown' || (!inInput && event.key === 'ArrowRight')
        ? 1
        : event.key === 'ArrowUp' || (!inInput && event.key === 'ArrowLeft')
          ? -1
          : null;
    if (step && moveFocus(event.currentTarget, event.target, step)) event.preventDefault();
  };

  const submitAddress = (event?: FormEvent) => {
    event?.preventDefault();
    const url = normalizeServerAddress(address);
    if (!url) {
      setError('Type the address of your server, like 192.168.1.10:3000');
      return;
    }
    void connect(url);
  };

  const servers = lastServer && !found.includes(lastServer) ? [lastServer, ...found] : found;

  return (
    <Page ref={pageRef} onKeyDown={handleKeyDown} aria-labelledby="server-picker-title">
      <Title id="server-picker-title">Connect to your Miauflix server</Title>
      <Subtitle>
        {lastServer
          ? `${displayServerAddress(lastServer)} doesn't answer. The TV reconnects when it is back.`
          : 'The TV needs to know where your Miauflix server is.'}
      </Subtitle>

      <Columns>
        {TV_PAIRING_URL && (
          <Section aria-labelledby="pairing-title">
            <SectionTitle id="pairing-title">Pair with a code</SectionTitle>
            <Hint>
              On your phone or computer, open Miauflix, go to Settings, choose Pair a TV and enter
            </Hint>
            {pairing ? (
              <>
                <Code aria-label={`Pairing code ${pairing.code.split('').join(' ')}`}>
                  {formatCode(pairing.code)}
                </Code>
                <Hint>The code changes in {formatTimeRemaining(secondsLeft)}</Hint>
              </>
            ) : pairingFailed ? (
              <>
                <Hint>The pairing service can&apos;t be reached.</Hint>
                <Button size="medium" color="secondary" onClick={renew}>
                  Try again
                </Button>
              </>
            ) : (
              <Hint>Getting a code…</Hint>
            )}
          </Section>
        )}

        <Section aria-labelledby="network-title">
          <SectionTitle id="network-title">On your network</SectionTitle>
          {servers.length > 0 && (
            <ServerList>
              {servers.map((url, index) => (
                <li key={url}>
                  <Button
                    ref={url === firstFound ? firstFoundRef : undefined}
                    size="medium"
                    fullWidth
                    color={index === 0 ? 'primary' : 'secondary'}
                    disabled={connecting !== null}
                    onClick={() => void connect(url)}
                  >
                    {connecting === url ? 'Connecting…' : displayServerAddress(url)}
                    {url === lastServer ? ' (last used)' : ''}
                  </Button>
                </li>
              ))}
            </ServerList>
          )}
          <Hint>
            {scanning
              ? 'Looking for servers…'
              : noNetwork
                ? "The TV can't tell which network it is on: type the address below."
                : found.length === 0
                  ? 'No server found. It has to be on the same network, reachable on port 3000.'
                  : 'Pick your server.'}
          </Hint>
          <Button size="medium" color="secondary" disabled={scanning} onClick={rescan}>
            Search again
          </Button>
        </Section>
      </Columns>

      <ManualForm onSubmit={submitAddress}>
        <div>
          <FieldLabel htmlFor="server-address">Or type its address</FieldLabel>
          <Input
            ref={inputRef}
            id="server-address"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="192.168.1.10:3000"
            value={address}
            onChange={event => setAddress(event.target.value)}
            onKeyDown={event => {
              if (event.keyCode === TIZEN_IME_DONE) submitAddress();
            }}
          />
        </div>
        <Button type="submit" size="medium" disabled={connecting !== null || !address.trim()}>
          {connecting && connecting === normalizeServerAddress(address) ? 'Connecting…' : 'Connect'}
        </Button>
      </ManualForm>
      <ErrorText role="alert">{error}</ErrorText>
    </Page>
  );
}
