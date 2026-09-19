import type { ConfigEntryView } from '@miauflix/backend';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ServiceConfigGroup } from './ServiceConfigGroup';

const entry = (key: string, required: boolean): ConfigEntryView => ({
  key,
  value: '',
  isSecret: false,
  serviceGroup: 'SERVICE',
  serviceDescription: 'Service description',
  description: `${key} description`,
  required,
  hasValue: !required,
  inputType: 'text',
});

const advancedEntry = (key: string, required: boolean): ConfigEntryView => ({
  ...entry(key, required),
  advanced: true,
});

describe('ServiceConfigGroup', () => {
  it('shows required fields first and keeps multiple optional fields collapsed initially', () => {
    render(
      <ServiceConfigGroup
        groupName="Service"
        entries={[
          entry('OPTIONAL_KEY', false),
          entry('OPTIONAL_KEY_TWO', false),
          entry('REQUIRED_KEY', true),
        ]}
        values={{ OPTIONAL_KEY: '', OPTIONAL_KEY_TWO: '', REQUIRED_KEY: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
      />
    );

    expect(screen.getByText('Required Key')).toBeInTheDocument();
    expect(screen.getByText('Service description')).toBeInTheDocument();
    expect(screen.queryByText('Optional Key')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Optional settings/ }));
    expect(screen.getByText('Optional Key')).toBeInTheDocument();
  });

  it('shows a single optional field without a collapsible section', () => {
    render(
      <ServiceConfigGroup
        groupName="Service"
        entries={[entry('OPTIONAL_KEY', false), entry('REQUIRED_KEY', true)]}
        values={{ OPTIONAL_KEY: '', REQUIRED_KEY: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
      />
    );

    expect(screen.getByText('Optional Key')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Optional settings/ })).not.toBeInTheDocument();
  });

  it('can show all optional fields directly for a wizard service step', () => {
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[
          entry('API_TOKEN', true),
          entry('API_URL', false),
          entry('EPISODE_SYNC_MODE', false),
        ]}
        values={{ API_TOKEN: '', API_URL: '', EPISODE_SYNC_MODE: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
        showAllOptionalFields
      />
    );

    expect(screen.getByText('API URL')).toBeInTheDocument();
    expect(screen.getByText('Episode Sync Mode')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Optional settings/ })).not.toBeInTheDocument();
  });

  it('keeps advanced fields collapsed and separate from optional fields', () => {
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[entry('TIMEOUT', false), advancedEntry('CATALOG_SERVICE_URL', false)]}
        values={{ TIMEOUT: '', CATALOG_SERVICE_URL: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
      />
    );

    expect(screen.getByText('Timeout')).toBeInTheDocument();
    expect(screen.queryByText('Catalog Service URL')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Advanced settings/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Catalog Service URL')).toBeInTheDocument();
  });

  it('opens advanced settings when an advanced required value is missing', () => {
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[advancedEntry('CATALOG_SERVICE_URL', true)]}
        values={{ CATALOG_SERVICE_URL: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
      />
    );

    expect(screen.getByRole('button', { name: /Advanced settings/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Catalog Service URL')).toBeInTheDocument();
    expect(screen.getByText('1 missing')).toBeInTheDocument();
  });

  it('opens advanced settings when an advanced field is implicated in a failed test', () => {
    const advanced = {
      ...advancedEntry('CATALOG_SERVICE_URL', true),
      testRelevant: true,
      testFailureHelp: 'The catalog URL may be unavailable.',
    };
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[advanced]}
        values={{ CATALOG_SERVICE_URL: 'http://localhost:3001' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
        result={{
          service: 'CATALOG',
          success: false,
          testMode: 'live',
          message: 'Connection refused',
        }}
      />
    );

    expect(screen.getByRole('button', { name: /Advanced settings/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(
      screen.getByLabelText('Catalog Service URL').closest('[data-test-failure]')
    ).toHaveAttribute('data-test-failure', 'true');
  });

  it('shows an advanced field warning when supplied', () => {
    render(
      <ServiceConfigGroup
        groupName="DOWNLOAD"
        entries={[{ ...advancedEntry('DOWNLOAD_SALT', false), warning: 'Keep this unchanged.' }]}
        values={{ DOWNLOAD_SALT: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Advanced settings/ }));
    expect(screen.getByText('Warning: Keep this unchanged.')).toBeInTheDocument();
  });

  it('provides per-service Test and Save actions', () => {
    const onTest = vi.fn();
    const onSave = vi.fn();
    render(
      <ServiceConfigGroup
        groupName="Service"
        entries={[entry('REQUIRED_KEY', true)]}
        values={{ REQUIRED_KEY: 'value' }}
        onChange={vi.fn()}
        onTest={onTest}
        onSave={onSave}
        hasChanges={true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onTest).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('highlights fields relevant to a failed test and lists possible causes', () => {
    const relevant = {
      ...entry('API_URL', false),
      testRelevant: true,
      testFailureHelp: 'The URL may be unavailable.',
    };
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[relevant, entry('UNRELATED_SETTING', false)]}
        values={{ API_URL: '', UNRELATED_SETTING: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
        result={{
          service: 'CATALOG',
          success: false,
          testMode: 'live',
          message: 'Connection refused',
        }}
      />
    );

    expect(screen.getByText('Failed to test CATALOG')).toBeInTheDocument();
    expect(screen.getByText('The URL may be unavailable.')).toBeInTheDocument();
    expect(screen.getByLabelText('API URL').closest('[data-test-failure]')).toHaveAttribute(
      'data-test-failure',
      'true'
    );
    expect(screen.getByLabelText('Unrelated Setting').closest('[data-test-failure]')).toBeNull();
  });

  it('keeps missing required values distinct from a failed test', () => {
    const required = { ...entry('API_TOKEN', true), testRelevant: true };
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[required]}
        values={{ API_TOKEN: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
        result={{
          service: 'CATALOG',
          success: false,
          testMode: 'validation',
          message: 'Missing API_TOKEN',
        }}
      />
    );

    expect(screen.getByText('1 missing')).toBeInTheDocument();
    expect(screen.queryByText('Failed to test CATALOG')).not.toBeInTheDocument();
    expect(screen.getByLabelText('API Token').closest('[data-test-failure]')).toBeNull();
  });

  it('shows a failed result after a required value has been entered locally', () => {
    const required = { ...entry('API_TOKEN', true), testRelevant: true };
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[required]}
        values={{ API_TOKEN: 'invalid-token' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges
        result={{
          service: 'CATALOG',
          success: false,
          testMode: 'live',
          message: 'Invalid API token',
        }}
      />
    );

    expect(screen.getByText('Failed to test CATALOG')).toBeInTheDocument();
    expect(screen.getByText('Invalid API token')).toBeInTheDocument();
  });

  it('marks a fully supplied service as configured when it has no failed test', () => {
    render(
      <ServiceConfigGroup
        groupName="CATALOG"
        entries={[{ ...entry('API_TOKEN', true), hasValue: true }]}
        values={{ API_TOKEN: '' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={false}
      />
    );

    expect(screen.getByText('configured')).toBeInTheDocument();
  });

  it.each([
    ['testing', 'Testing'],
    ['saving', 'Saving'],
    ['saved', 'Saved'],
  ] as const)('renders the %s action state accurately', (activeAction, label) => {
    render(
      <ServiceConfigGroup
        groupName="Service"
        entries={[{ ...entry('REQUIRED_KEY', true), hasValue: true }]}
        values={{ REQUIRED_KEY: 'value' }}
        onChange={vi.fn()}
        onTest={vi.fn()}
        onSave={vi.fn()}
        hasChanges={activeAction === 'saving'}
        activeAction={activeAction}
      />
    );

    expect(screen.getByRole('button', { name: label, exact: true })).toBeInTheDocument();
    if (activeAction === 'saved') {
      expect(screen.getByRole('button', { name: 'Saved' }).querySelector('svg')).toBeNull();
    }
  });
});
