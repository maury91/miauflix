import { TV_PAIRING_URL } from '@shared/config/constants';
import { useKeyboard } from '@shared/hooks/useKeyboard';
import { Button, FieldLabel, Input } from '@shared/ui';
import type { FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { connectTvServer } from '../lib/connect';
import { lookupAnnouncedServers } from '../lib/lookup';
import { probeServer } from '../lib/probe';
import { getTvIpAddress, scanSubnet } from '../lib/scan';
import { displayServerAddress, normalizeServerAddress } from '../lib/server-address';

/** Tizen's on-screen keyboard reports its Done key with this key code. */
const TIZEN_IME_DONE = 65376;
/** How long an announced address gets to answer: a stale or container-only one shouldn't hold up the list. */
const ANNOUNCED_PROBE_TIMEOUT_MS = 2000;
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

// Sized for a TV seen from the couch: the page only shows on the TV app
const Title = styled.h1`
  margin: 0 0 12px;
  font-size: 44px;
  font-weight: 400;
  text-align: center;
`;

const Subtitle = styled.p`
  margin: 0 0 40px;
  color: #9aa3ab;
  font-size: 22px;
  text-align: center;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 880px;
  min-height: 280px;
  padding: 32px;
  background-color: #0c1214;
  border: 1px solid #191e23;
  border-radius: 16px;
  box-sizing: border-box;
`;

const SectionTitle = styled.h2`
  margin: 0 0 24px;
  font-size: 30px;
  font-weight: 400;
`;

const Hint = styled.p`
  margin: 0 0 20px;
  color: #9aa3ab;
  font-size: 20px;
  line-height: 1.5;
  text-align: center;
`;

// Every button is secondary: a red one looks the same focused or not, and on a TV the focus has
// to be the one thing that stands out
const ServerList = styled.ul`
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  width: 100%;

  li + li {
    margin-top: 12px;
  }
`;

const ManualForm = styled.form`
  display: flex;
  align-items: flex-end;
  width: 100%;
  max-width: 880px;
  margin-top: 32px;

  > div {
    flex: 1;
    margin-right: 16px;
  }

  label {
    margin-bottom: 10px;
    font-size: 20px;
  }

  input {
    height: 64px;
    font-size: 24px;
  }

  /* As visible as the buttons' focus, for a remote */
  input:focus {
    border-color: #ffffff;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.35);
  }
`;

const ErrorText = styled.p`
  min-height: 30px;
  margin: 16px 0 0;
  color: #ff6b7f;
  font-size: 20px;
  text-align: center;
`;

/** The addresses of the servers announced from the TV's network that answer. */
async function findAnnouncedServers(
  signal: AbortSignal,
  onFound: (url: string) => void
): Promise<void> {
  if (!TV_PAIRING_URL) return;
  const servers = await lookupAnnouncedServers(TV_PAIRING_URL).catch(() => []);
  // A server announces every address it may be reached at: list the first that answers
  await Promise.all(
    servers.map(async server => {
      for (const url of server.urls) {
        if (signal.aborted) return;
        if (await probeServer(url, { signal, timeoutMs: ANNOUNCED_PROBE_TIMEOUT_MS })) {
          onFound(url);
          return;
        }
      }
    })
  );
}

/**
 * The servers on the TV's network, found as they answer: the ones that announced themselves to
 * the pairing service (when the package has one), and the ones a scan of the /24 finds.
 * `rescan` starts over.
 */
function useServerSearch() {
  const [found, setFound] = useState<string[]>([]);
  const [searching, setSearching] = useState(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const onFound = (url: string) => {
      if (controller.signal.aborted) return;
      setFound(current => (current.includes(url) ? current : [...current, url]));
    };
    setSearching(true);
    setFound([]);
    void Promise.all([
      findAnnouncedServers(controller.signal, onFound),
      getTvIpAddress().then(ip =>
        ip ? scanSubnet(ip, { signal: controller.signal, onFound }) : []
      ),
    ]).finally(() => {
      if (!controller.signal.aborted) setSearching(false);
    });
    return () => controller.abort();
  }, [generation]);

  const searchingRef = useRef(true);
  searchingRef.current = searching;
  // Ignored while a search runs: the button stays enabled, so a remote doesn't lose its focus
  const rescan = useCallback(() => {
    if (!searchingRef.current) setGeneration(value => value + 1);
  }, []);
  return { found, searching, rescan };
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
 * Shown on the TV until it has a server: among the servers found on its network, or by typing
 * the address.
 */
export function ServerPicker({ lastServer }: ServerPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { found, searching, rescan } = useServerSearch();

  const connectingRef = useRef(false);
  // Buttons stay enabled while connecting (a disabled one would drop the remote's focus), so a
  // second press is ignored here instead
  const connect = useCallback(async (url: string) => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(url);
    setError(null);
    if (await probeServer(url)) {
      connectTvServer(url);
      return;
    }
    connectingRef.current = false;
    setConnecting(null);
    setError(`No Miauflix server answers at ${displayServerAddress(url)}`);
  }, []);

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
    <Page onKeyDown={handleKeyDown} aria-labelledby="server-picker-title">
      <Title id="server-picker-title">Connect to your Miauflix server</Title>
      <Subtitle>
        {lastServer
          ? `${displayServerAddress(lastServer)} doesn't answer. The TV reconnects when it is back.`
          : 'The TV needs to know where your Miauflix server is.'}
      </Subtitle>

      <Section aria-labelledby="network-title">
        <SectionTitle id="network-title">On your network</SectionTitle>
        {servers.length > 0 && (
          <ServerList>
            {servers.map(url => (
              <li key={url}>
                <Button
                  ref={url === firstFound ? firstFoundRef : undefined}
                  size="large"
                  fullWidth
                  color="secondary"
                  aria-busy={connecting === url}
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
          {searching
            ? 'Looking for servers…'
            : found.length === 0
              ? 'No server found. It has to be on the same network as the TV.'
              : 'Pick your server.'}
        </Hint>
        <Button size="large" color="secondary" aria-busy={searching} onClick={rescan}>
          {searching ? 'Searching…' : 'Search again'}
        </Button>
      </Section>

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
        <Button type="submit" size="large" color="secondary" aria-busy={connecting !== null}>
          {connecting && connecting === normalizeServerAddress(address) ? 'Connecting…' : 'Connect'}
        </Button>
      </ManualForm>
      <ErrorText role="alert">{error}</ErrorText>
    </Page>
  );
}
