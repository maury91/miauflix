import {
  call,
  type Client,
  contract,
  defineService,
  isContractError,
  type ManagedConfiguration,
  type RunningServer,
  serve,
  type ServiceConfigSchema,
  type ServiceStatus,
} from '@miauflix/contract';

import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import type { ServiceInstanceStatus } from '@mytypes/configuration';
import type { ConfigurationService } from '@services/configuration/configuration.service';

import { previousMajor, RemoteService } from './remote-service';

/** The backend speaks demo 2.x; 1.x is the previous major (adapted), 3.x is too far ahead. */
const demo = contract('demo', '2.0', {
  hello: call<{ name: string }, string, 'not_found'>(),
});
const demoV1 = contract('demo', '1.0', { greet: call<string, string>() });
const demoV3 = contract('demo', '3.0', { hi: call<{ who: string }, string>() });
type Major = 1 | 2 | 3;

const schema: ServiceConfigSchema = {
  groups: [
    {
      id: 'DEMO',
      name: 'Demo',
      description: 'Demo provider',
      variables: [
        { key: 'DEMO_TOKEN', description: 'Token', required: true, inputType: 'password' },
      ],
    },
  ],
};

/** A served fake service whose configuration accepts DEMO_TOKEN=good only. */
const startService = async (options: { majors?: Major[]; port?: number } = {}) => {
  const listeners = new Set<() => void>();
  let values: Record<string, string> = {};
  const applied: Array<Record<string, string>> = [];
  const tested: Array<Record<string, string>> = [];
  const ready = () => values.DEMO_TOKEN === 'good';
  const notify = () => listeners.forEach(listener => listener());
  const configuration: ManagedConfiguration = {
    getSchema: () => schema,
    get ready() {
      return ready();
    },
    test: async candidate => {
      tested.push(candidate);
      return candidate.DEMO_TOKEN === 'good'
        ? { success: true, mode: 'live', message: 'Token accepted' }
        : { success: false, mode: 'live', message: 'Token rejected', invalidKeys: ['DEMO_TOKEN'] };
    },
    applyRemote: async candidate => {
      applied.push(candidate);
      if (candidate.DEMO_TOKEN !== 'good')
        return {
          success: false,
          activated: false,
          invalidKeys: ['DEMO_TOKEN'],
          test: { success: false, mode: 'live', message: 'Token rejected' },
        };
      values = candidate;
      notify();
      return { success: true, activated: true };
    },
    clearRemote: async () => {
      values = {};
      notify();
      return { success: true, activated: false };
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const status = (): ServiceStatus =>
    ready() ? { state: 'ready' } : { state: 'standby', missingConfiguration: ['DEMO_TOKEN'] };
  const service = defineService({
    info: { id: 'demo', name: 'Demo', description: 'Demo service', version: '2.0.0' },
    configuration,
    status,
  });
  const majors = options.majors ?? [2];
  if (majors.includes(1)) service.implement(demoV1, { greet: name => `v1 hello ${name}` });
  if (majors.includes(2))
    service.implement(demo, {
      hello: ({ name }, ctx) => (name === 'nobody' ? ctx.fail('not_found') : `hello ${name}`),
    });
  if (majors.includes(3)) service.implement(demoV3, { hi: ({ who }) => `hi ${who}` });
  const server = await serve(service, { hostname: '127.0.0.1', port: options.port ?? 0 });
  return {
    server,
    applied,
    tested,
    /** Simulates the service losing its values (as after a restart) without dropping the socket. */
    forget: () => {
      values = {};
      notify();
    },
  };
};

const setupTest = (server: RunningServer, snapshot?: Record<string, string>) => {
  const dynamic: Record<string, string> = {
    DEMO_SERVICE_URL: `http://127.0.0.1:${server.port}`,
    DEMO_SERVICE_TIMEOUT_MS: '2000',
  };
  const configuration = {
    getDynamic: jest.fn((key: string) => dynamic[key]),
    registerRemoteConfiguration: jest.fn(),
    getServiceConfigSnapshot: jest.fn(() => snapshot),
  };
  const remote = new RemoteService(configuration as unknown as ConfigurationService, {
    serviceName: 'CATALOG',
    urlKey: 'DEMO_SERVICE_URL',
    timeoutKey: 'DEMO_SERVICE_TIMEOUT_MS',
    contract: demo,
    previous: previousMajor(
      demoV1,
      (v1): Client<typeof demo> => ({ hello: ({ name }) => v1.greet(name) })
    ),
  });
  return { remote, configuration, dynamic };
};

const statusOf = (remote: RemoteService<typeof demo>, expected: ServiceInstanceStatus['status']) =>
  new Promise<ServiceInstanceStatus>((resolve, reject) => {
    if (remote.getStatus().status === expected) return resolve(remote.getStatus());
    const timer = setTimeout(
      () => reject(new Error(`Status stayed ${JSON.stringify(remote.getStatus())}`)),
      3_000
    );
    const off = remote.subscribeStatus(status => {
      if (status.status !== expected) return;
      clearTimeout(timer);
      off();
      resolve(status);
    });
  });

describe('RemoteService', () => {
  const servers: RunningServer[] = [];
  const remotes: Array<RemoteService<typeof demo>> = [];
  const start = async (options?: Parameters<typeof startService>[0]) => {
    const started = await startService(options);
    servers.push(started.server);
    return started;
  };
  const connect = (server: RunningServer, snapshot?: Record<string, string>) => {
    const test = setupTest(server, snapshot);
    remotes.push(test.remote);
    return test;
  };

  afterEach(async () => {
    remotes.splice(0).forEach(remote => remote.stop());
    await Promise.all(servers.splice(0).map(server => server.stop()));
  });

  it('registers the remote schema, delivers the stored snapshot and becomes ready', async () => {
    const { server, applied } = await start();
    const { remote, configuration } = connect(server, { DEMO_TOKEN: 'good' });

    await remote.initialize();

    expect(configuration.registerRemoteConfiguration).toHaveBeenCalledWith('CATALOG', schema);
    expect(applied).toEqual([{ DEMO_TOKEN: 'good' }]);
    await statusOf(remote, 'ready');
    await expect(remote.client.hello({ name: 'ada' })).resolves.toBe('hello ada');
  });

  it('reports a standby service with missing configuration as degraded and gates calls', async () => {
    const { server } = await start();
    const { remote } = connect(server);

    await remote.initialize();

    expect(await statusOf(remote, 'degraded')).toMatchObject({ missingVars: ['DEMO_TOKEN'] });
    await expect(remote.client.hello({ name: 'ada' })).rejects.toBeInstanceOf(
      ServiceNotConfiguredError
    );
  });

  it('passes declared errors through to callers', async () => {
    const { server } = await start();
    const { remote } = connect(server, { DEMO_TOKEN: 'good' });
    await remote.initialize();
    await statusOf(remote, 'ready');

    const error = await remote.client.hello({ name: 'nobody' }).catch((e: unknown) => e);
    expect(isContractError(error, 'not_found')).toBe(true);
  });

  it('re-delivers the snapshot when a running service returns to standby', async () => {
    const { server, applied, forget } = await start();
    const { remote } = connect(server, { DEMO_TOKEN: 'good' });
    await remote.initialize();
    await statusOf(remote, 'ready');

    forget();

    await statusOf(remote, 'degraded');
    await statusOf(remote, 'ready');
    expect(applied).toEqual([{ DEMO_TOKEN: 'good' }, { DEMO_TOKEN: 'good' }]);
  });

  it('talks to a service one major behind through the adapter', async () => {
    const { server } = await start({ majors: [1] });
    const { remote } = connect(server, { DEMO_TOKEN: 'good' });

    await remote.initialize();

    await statusOf(remote, 'ready');
    await expect(remote.client.hello({ name: 'ada' })).resolves.toBe('v1 hello ada');
  });

  it('prefers its own major on a service that also speaks the next one', async () => {
    const { server } = await start({ majors: [2, 3] });
    const { remote } = connect(server, { DEMO_TOKEN: 'good' });

    await remote.initialize();

    await statusOf(remote, 'ready');
    await expect(remote.client.hello({ name: 'ada' })).resolves.toBe('hello ada');
  });

  it('reports a service two majors apart as incompatible', async () => {
    const { server } = await start({ majors: [3] });
    const { remote } = connect(server, { DEMO_TOKEN: 'good' });

    await remote.initialize();

    expect(await statusOf(remote, 'error')).toMatchObject({
      errorMessage:
        'Incompatible demo contract: the service offers v3.0; this backend supports v2.x, v1.x',
    });
  });

  it('reconnects and reconfigures a service that restarted', async () => {
    const first = await start();
    const { remote } = connect(first.server, { DEMO_TOKEN: 'good' });
    await remote.initialize();
    await statusOf(remote, 'ready');
    const port = first.server.port;

    await first.server.stop();
    servers.splice(servers.indexOf(first.server), 1);
    await statusOf(remote, 'error');

    const second = await start({ port });
    await statusOf(remote, 'ready');
    expect(second.applied).toEqual([{ DEMO_TOKEN: 'good' }]);
    await expect(remote.client.hello({ name: 'again' })).resolves.toBe('hello again');
  });

  it('tests draft values without applying them, and falls back to the stored snapshot', async () => {
    const { server, applied, tested } = await start();
    const { remote } = connect(server, { DEMO_TOKEN: 'good' });
    await remote.initialize();

    await expect(
      remote.testConfiguration([{ key: 'DEMO_TOKEN', value: 'bad' }])
    ).resolves.toMatchObject({ success: false, message: 'Token rejected' });
    await expect(remote.testConfiguration()).resolves.toMatchObject({ success: true });
    expect(tested).toEqual([{ DEMO_TOKEN: 'bad' }, { DEMO_TOKEN: 'good' }]);
    expect(applied).toEqual([{ DEMO_TOKEN: 'good' }]);
  });

  it('returns a validation result when no snapshot is stored', async () => {
    const { server } = await start();
    const { remote } = connect(server);
    await remote.initialize();

    await expect(remote.testConfiguration()).resolves.toEqual({
      success: false,
      mode: 'validation',
      message: 'Stored configuration snapshot for CATALOG is unavailable',
      invalidKeys: [],
    });
  });

  it('probes a draft service URL over its own connection', async () => {
    const live = await start();
    const candidate = await start();
    const { remote, dynamic } = connect(live.server, { DEMO_TOKEN: 'good' });
    await remote.initialize();

    dynamic.DEMO_SERVICE_URL = `http://127.0.0.1:${candidate.server.port}`;
    await expect(
      remote.testConfiguration([{ key: 'DEMO_TOKEN', value: 'good' }])
    ).resolves.toMatchObject({ success: true });

    expect(candidate.tested).toEqual([{ DEMO_TOKEN: 'good' }]);
    expect(live.tested).toEqual([]);
  });

  it('surfaces a rejected snapshot during reload', async () => {
    const { server } = await start();
    const snapshot = { DEMO_TOKEN: 'good' };
    const { remote, configuration } = connect(server, snapshot);
    await remote.initialize();
    configuration.getServiceConfigSnapshot.mockReturnValue({ DEMO_TOKEN: 'bad' });

    await expect(remote.reload()).rejects.toThrow('Token rejected');
  });
});
