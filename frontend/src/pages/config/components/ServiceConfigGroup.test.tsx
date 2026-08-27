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
  it('shows required fields first and keeps optional fields collapsed initially', () => {
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

    expect(screen.getByText('REQUIRED_KEY')).toBeInTheDocument();
    expect(screen.getByText('Service description')).toBeInTheDocument();
    expect(screen.queryByText('OPTIONAL_KEY')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Optional settings/ }));
    expect(screen.getByText('OPTIONAL_KEY')).toBeInTheDocument();
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
});
