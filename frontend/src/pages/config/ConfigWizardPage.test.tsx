import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useGetConfigQuery: vi.fn(),
  useGetServiceStatusesQuery: vi.fn(),
  useUpdateConfigMutation: vi.fn(),
  useTestServiceConfigMutation: vi.fn(),
  useSaveServiceConfigMutation: vi.fn(),
}));

vi.mock('@features/config/api/config.api', () => mocks);
vi.mock('framer-motion', () => ({ motion: { div: 'div' } }));

import ConfigurationWizardPage from './ConfigurationWizardPage';
import ConfigWizardPage from './ConfigWizardPage';

describe('ConfigWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        {
          key: 'CATALOG_SERVICE_URL',
          value: '',
          isSecret: false,
          serviceGroup: 'CATALOG',
          serviceDescription: 'Catalog service',
          description: 'Catalog service URL',
          required: true,
          hasValue: false,
          inputType: 'text',
        },
      ],
      isLoading: false,
    });
    mocks.useGetServiceStatusesQuery.mockReturnValue({ data: {}, isLoading: false });
    mocks.useUpdateConfigMutation.mockReturnValue([vi.fn(), { isLoading: false }]);
    mocks.useTestServiceConfigMutation.mockReturnValue([vi.fn()]);
    mocks.useSaveServiceConfigMutation.mockReturnValue([vi.fn()]);
  });

  it('keeps the saved state until the service is edited again', async () => {
    const save = vi.fn().mockResolvedValue({
      data: {
        success: true,
        services: [
          {
            service: 'CATALOG',
            success: true,
            testMode: 'live',
            message: 'Catalog saved',
          },
        ],
        restarted: [],
        needsProcessRestart: [],
        changed: ['CATALOG'],
        recovered: [],
      },
    });
    mocks.useSaveServiceConfigMutation.mockReturnValue([save]);

    render(<ConfigWizardPage onDismiss={vi.fn()} />);

    const field = screen.getByRole('textbox', { name: 'Catalog Service URL' });
    fireEvent.change(field, { target: { value: 'http://catalog:3001' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    });

    expect(screen.getByRole('button', { name: 'Saved', exact: true })).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'http://catalog:3002' } });
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeInTheDocument();
  }, 10_000);

  it('renders shared Trakt settings as one group and reports every consumer test', async () => {
    const test = vi.fn().mockResolvedValue({
      data: {
        success: true,
        services: [
          { service: 'CATALOG', success: true, testMode: 'live', message: 'Trakt ready' },
          { service: 'LIST', success: true, testMode: 'live', message: 'Trakt ready' },
        ],
      },
    });
    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        {
          key: 'TRAKT_CLIENT_ID',
          value: '',
          isSecret: false,
          serviceGroup: 'TRAKT',
          serviceDescription: 'Shared Trakt settings',
          description: 'Client ID',
          required: true,
          hasValue: false,
          inputType: 'text',
        },
        {
          key: 'TRAKT_CLIENT_SECRET',
          value: '',
          isSecret: true,
          serviceGroup: 'TRAKT',
          serviceDescription: 'Shared Trakt settings',
          description: 'Client secret',
          required: true,
          hasValue: false,
          inputType: 'text',
        },
      ],
      isLoading: false,
    });
    mocks.useTestServiceConfigMutation.mockReturnValue([test]);

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);

    expect(screen.getAllByRole('heading', { name: 'Trakt' })).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Trakt Client ID' }), {
      target: { value: 'client-id' },
    });
    fireEvent.change(screen.getByLabelText('Trakt Client Secret'), {
      target: { value: 'client-secret' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test', exact: true }));
    });
    await waitFor(() =>
      expect(screen.getByText(/CATALOG: Trakt ready · LIST: Trakt ready/)).toBeVisible()
    );
    expect(test).toHaveBeenCalledWith({
      service: 'TRAKT',
      entries: [
        { key: 'TRAKT_CLIENT_ID', value: 'client-id' },
        { key: 'TRAKT_CLIENT_SECRET', value: 'client-secret' },
      ],
    });
  });

  it('summarizes optional integrations and keeps runtime infrastructure under advanced settings', () => {
    const optionalEntry = (key: string, serviceGroup: string, hasValue = false) => ({
      key,
      value: hasValue ? 'configured' : '',
      isSecret: false,
      serviceGroup,
      serviceDescription: `${serviceGroup} settings`,
      description: `${key} description`,
      required: false,
      hasValue,
      inputType: 'text' as const,
    });

    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        optionalEntry('TMDB_API_URL', 'CATALOG', true),
        optionalEntry('EPISODE_SYNC_MODE', 'CATALOG_RUNTIME'),
        optionalEntry('TRAKT_API_URL', 'LIST'),
        optionalEntry('JWT_TTL', 'JWT'),
        optionalEntry('QUEUE_URL', 'QUEUE'),
        optionalEntry('PORT', 'SERVER'),
      ],
      isLoading: false,
    });

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Optional settings' })).toBeInTheDocument();
    expect(screen.getByText('Movie and show metadata from The Movie Database.')).toBeVisible();
    expect(screen.getByText('Trakt lists')).toBeVisible();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);

    const advanced = screen.getByText('Advanced settings (4 groups)');
    expect(advanced).toBeVisible();
    fireEvent.click(advanced);
    expect(screen.getByText('Catalog runtime')).toBeVisible();
    expect(screen.getByText('JWT')).toBeVisible();
    expect(screen.getByText('Background job queue connection.')).toBeVisible();
  });
});
