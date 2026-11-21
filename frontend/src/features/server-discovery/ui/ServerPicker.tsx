import { TV_PAIRING_URL } from '@shared/config/constants';
import {
  ActionGroup,
  Button,
  FormSection,
  Heading,
  Message,
  ScrollArea,
  Section,
  Stack,
  Surface,
  SurfaceContextProvider,
  Text,
  TextField,
} from '@shared/design-system';
import { TIZEN_IME_DONE } from '@shared/hooks/useKeyboard';
import { FocusScope, NavigationProvider, useNavigation } from '@shared/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { connectTvServer } from '../lib/connect';
import { lookupAnnouncedServers } from '../lib/lookup';
import { probeServer } from '../lib/probe';
import { getTvIpAddress, scanSubnet } from '../lib/scan';
import { displayServerAddress, normalizeServerAddress } from '../lib/server-address';
import * as styles from './serverPicker.css';

/** How long an announced address gets to answer: a stale or container-only one shouldn't hold up the list. */
const ANNOUNCED_PROBE_TIMEOUT_MS = 2000;
/** How often an unreachable last server is tried again; it reconnects once it answers. */
const LAST_SERVER_RETRY_MS = 10_000;

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
  // Ignored while a search runs (the button shows it is busy and keeps its focus)
  const rescan = useCallback(() => {
    if (!searchingRef.current) setGeneration(value => value + 1);
  }, []);
  return { found, searching, rescan };
}

export interface ServerPickerProps {
  /** The server the TV used last, which didn't answer at startup. */
  lastServer?: string;
}

const NAV = {
  address: 'server-address',
  connect: 'server-connect',
  rescan: 'server-rescan',
  server: (url: string) => `server:${url}`,
} as const;

/**
 * Shown on the TV until it has a server: among the servers found on its network, or by typing
 * the address. Its own navigation layer: Down goes through the servers, Search again, the address
 * and Connect; the address has the focus first, and the first server found takes it while nothing
 * was typed. A `ScrollArea` brings what the remote reaches into view when the list is long.
 */
export function ServerPicker(props: ServerPickerProps) {
  return (
    <main className={styles.page} aria-labelledby="server-picker-title">
      <NavigationProvider>
        <SurfaceContextProvider value="solid">
          <FocusScope autoFocus initialId={NAV.address}>
            <ScrollArea>
              <div className={styles.column}>
                <ServerPickerContent {...props} />
              </div>
            </ScrollArea>
          </FocusScope>
        </SurfaceContextProvider>
      </NavigationProvider>
    </main>
  );
}

function ServerPickerContent({ lastServer }: ServerPickerProps) {
  const navigation = useNavigation();
  const [address, setAddress] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { found, searching, rescan } = useServerSearch();

  const connectingRef = useRef(false);
  // A second press while connecting is ignored (`loading` keeps the button and its focus)
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

  // The first server found takes the focus while nothing was typed yet
  const firstFound = found[0];
  const addressRef = useRef(address);
  addressRef.current = address;
  useEffect(() => {
    if (firstFound && navigation.getActiveId() === NAV.address && !addressRef.current)
      navigation.focus(NAV.server(firstFound));
    // The store's methods are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstFound]);

  const submitAddress = () => {
    const url = normalizeServerAddress(address);
    if (!url) {
      setError('Type the address of your server, like 192.168.1.10:3000');
      return;
    }
    void connect(url);
  };

  const servers = lastServer && !found.includes(lastServer) ? [lastServer, ...found] : found;

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Heading level={1} variant="title" align="center" id="server-picker-title">
          Connect to your Miauflix server
        </Heading>
        <Text tone="secondary" align="center">
          {lastServer
            ? `${displayServerAddress(lastServer)} doesn't answer. The TV reconnects when it is back.`
            : 'The TV needs to know where your Miauflix server is.'}
        </Text>
      </Stack>

      <Surface border radius="lg" padding="xl">
        <Section title="On your network">
          <Stack gap="md">
            {servers.length > 0 && (
              <ActionGroup layout="column" label="Servers">
                {servers.map(url => (
                  <Button
                    key={url}
                    navId={NAV.server(url)}
                    size="lg"
                    fullWidth
                    loading={connecting === url}
                    onClick={() => void connect(url)}
                  >
                    {displayServerAddress(url)}
                    {url === lastServer ? ' (last used)' : ''}
                  </Button>
                ))}
              </ActionGroup>
            )}
            <Text tone="secondary" align="center">
              {searching
                ? 'Looking for servers…'
                : found.length === 0
                  ? 'No server found. It has to be on the same network as the TV.'
                  : 'Pick your server.'}
            </Text>
            <ActionGroup align="center">
              <Button navId={NAV.rescan} size="lg" loading={searching} onClick={rescan}>
                {searching ? 'Searching…' : 'Search again'}
              </Button>
            </ActionGroup>
          </Stack>
        </Section>
      </Surface>

      <FormSection
        navId="server-manual"
        title="Server address"
        titleHidden
        onSubmit={submitAddress}
        message={
          error ? (
            <Message tone="danger" toneLabel="Error" live="assertive">
              {error}
            </Message>
          ) : undefined
        }
        actions={
          <Button
            navId={NAV.connect}
            type="submit"
            size="lg"
            loading={connecting !== null && connecting === normalizeServerAddress(address)}
          >
            Connect
          </Button>
        }
      >
        <TextField
          navId={NAV.address}
          id="server-address"
          label="Or type its address"
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
      </FormSection>
    </Stack>
  );
}
