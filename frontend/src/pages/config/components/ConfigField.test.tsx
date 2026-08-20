import type { ConfigEntryView } from '@miauflix/backend';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfigField } from './ConfigField';

const makeEntry = (overrides: Partial<ConfigEntryView>): ConfigEntryView => ({
  key: 'CONFIG_KEY',
  value: '',
  isSecret: false,
  serviceGroup: 'SERVICE',
  serviceDescription: 'Service description',
  description: 'Description',
  required: false,
  hasValue: true,
  inputType: 'text',
  ...overrides,
});

describe('ConfigField', () => {
  it('writes canonical boolean values from the toggle', () => {
    const onChange = vi.fn();
    render(
      <ConfigField entry={makeEntry({ inputType: 'boolean' })} value="false" onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('switch', { name: 'CONFIG_KEY' }));
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', 'true');
  });

  it('describes the actual feature state for negative boolean fields', () => {
    const { rerender } = render(
      <ConfigField
        entry={makeEntry({
          key: 'DISABLE_DISCOVERY',
          inputType: 'boolean',
          booleanStateDescriptions: {
            true: 'DHT discovery paused',
            false: 'DHT discovery active',
          },
        })}
        value="false"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('DHT discovery active')).toBeInTheDocument();

    rerender(
      <ConfigField
        entry={makeEntry({
          key: 'DISABLE_DISCOVERY',
          inputType: 'boolean',
          booleanStateDescriptions: {
            true: 'DHT discovery paused',
            false: 'DHT discovery active',
          },
        })}
        value="true"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('DHT discovery paused')).toBeInTheDocument();
  });

  it('renders numeric controls with supplied constraints', () => {
    render(
      <ConfigField
        entry={makeEntry({
          inputType: 'number',
          numberOptions: { min: 1, max: 10, integer: true },
        })}
        value="5"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('CONFIG_KEY');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '10');
    expect(input).toHaveAttribute('step', '1');
  });

  it('makes saved secret values clear without exposing them', () => {
    render(
      <ConfigField
        entry={makeEntry({ isSecret: true, hasValue: true })}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('✓ value saved')).toBeInTheDocument();
    expect(screen.getByLabelText('CONFIG_KEY')).toHaveAttribute(
      'placeholder',
      'A value is saved — enter a new value to replace it'
    );
  });

  it('composes a size from its number and unit controls', () => {
    const onChange = vi.fn();
    render(
      <ConfigField
        entry={makeEntry({ inputType: 'size', sizeUnits: ['MB', 'GB'] })}
        value="20MB"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('CONFIG_KEY'), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '30MB');
    fireEvent.change(screen.getByLabelText('CONFIG_KEY unit'), { target: { value: 'GB' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '20GB');
  });

  it('composes a duration from its number and unit controls', () => {
    const onChange = vi.fn();
    render(
      <ConfigField
        entry={makeEntry({ inputType: 'time', timeUnits: ['s', 'm', 'h', 'd'] })}
        value="15m"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('CONFIG_KEY'), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '30m');
    expect(screen.getByRole('option', { name: 'Minutes' })).toHaveValue('m');
    expect(screen.getByRole('option', { name: 'Hours' })).toHaveValue('h');
    fireEvent.change(screen.getByLabelText('CONFIG_KEY unit'), { target: { value: 'h' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '15h');
  });
});
