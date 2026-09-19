import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useGetConfigQuery: vi.fn(),
  useGetServiceStatusesQuery: vi.fn(),
  useUpdateConfigMutation: vi.fn(),
  useTestServiceConfigMutation: vi.fn(),
  useSaveServiceConfigMutation: vi.fn(),
}));

vi.mock('@features/config/api/config.api', () => mocks);

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
  });

  it('keeps the saved state until the service is edited again', async () => {
    let resolveSave!: (value: unknown) => void;
    const save = vi.fn(
      () =>
        new Promise(resolve => {
          resolveSave = resolve;
        })
    );
    mocks.useSaveServiceConfigMutation.mockReturnValue([save]);

    render(<ConfigWizardPage onDismiss={vi.fn()} />);

    const field = screen.getByRole('textbox', { name: 'Catalog Service URL' });
    fireEvent.change(field, { target: { value: 'http://catalog:3001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));

    expect(screen.getByRole('button', { name: 'Saving', exact: true })).toBeInTheDocument();

    resolveSave({
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saved', exact: true })).toBeInTheDocument();
    });

    fireEvent.change(field, { target: { value: 'http://catalog:3002' } });
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeInTheDocument();
  });
});
