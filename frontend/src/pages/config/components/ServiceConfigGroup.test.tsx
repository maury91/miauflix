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

    expect(screen.getByText('REQUIRED_KEY')).toBeInTheDocument();
    expect(screen.getByText('Service description')).toBeInTheDocument();
    expect(screen.queryByText('OPTIONAL_KEY')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Optional settings/ }));
    expect(screen.getByText('OPTIONAL_KEY')).toBeInTheDocument();
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

    expect(screen.getByText('OPTIONAL_KEY')).toBeInTheDocument();
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

    expect(screen.getByText('API_URL')).toBeInTheDocument();
    expect(screen.getByText('EPISODE_SYNC_MODE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Optional settings/ })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('API_URL').closest('[data-test-failure]')).toHaveAttribute(
      'data-test-failure',
      'true'
    );
    expect(screen.getByLabelText('UNRELATED_SETTING').closest('[data-test-failure]')).toBeNull();
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
    expect(screen.getByLabelText('API_TOKEN').closest('[data-test-failure]')).toBeNull();
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
});
