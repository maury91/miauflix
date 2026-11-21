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

    fireEvent.click(screen.getByRole('switch', { name: 'Config Key' }));
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
    const onChange = vi.fn();
    render(
      <ConfigField
        entry={makeEntry({
          inputType: 'number',
          numberOptions: { min: 1, max: 10, integer: true },
        })}
        value="5"
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Config Key');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveValue('5');
    // The value is committed when editing ends, clamped to the limits
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Config Key' }));
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '4');
  });

  it('describes the field with its help text', () => {
    render(
      <ConfigField
        entry={makeEntry({ description: 'Numeric setting help' })}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Config Key' })).toHaveAccessibleDescription(
      /Numeric setting help/
    );
  });

  it('renders constrained options as a dropdown without an example', () => {
    const onChange = vi.fn();
    render(
      <ConfigField
        entry={makeEntry({
          inputType: 'select',
          options: { GREEDY: 'sync every tv show', ON_DEMAND: 'sync watched tv shows' },
          example: 'ON_DEMAND',
        })}
        value="ON_DEMAND"
        onChange={onChange}
      />
    );

    expect(screen.getByLabelText('Config Key')).toHaveValue('ON_DEMAND');
    expect(screen.getByRole('option', { name: 'GREEDY — sync every tv show' })).toBeInTheDocument();
    expect(screen.queryByText('Example: ON_DEMAND')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Config Key'), { target: { value: 'GREEDY' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', 'GREEDY');
  });

  it('uses the input placeholder instead of repeating an example', () => {
    render(
      <ConfigField
        entry={makeEntry({ example: 'https://api.example.com' })}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Config Key')).toHaveAttribute(
      'placeholder',
      'e.g. https://api.example.com'
    );
    expect(screen.queryByText('Example: https://api.example.com')).not.toBeInTheDocument();
  });

  it('does not show examples for boolean toggles', () => {
    render(
      <ConfigField
        entry={makeEntry({ inputType: 'boolean', example: 'false' })}
        value="false"
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Example: false')).not.toBeInTheDocument();
  });

  it('makes saved secret values clear without exposing them', () => {
    render(
      <ConfigField
        entry={makeEntry({ isSecret: true, hasValue: true })}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByText('✓ value saved')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Config Key')).toHaveAttribute(
      'placeholder',
      'Enter a new value to replace the saved one'
    );
  });

  it('explains where a linked configuration value can be found', () => {
    render(
      <ConfigField
        entry={makeEntry({
          description: 'Create an API token in the provider settings, then paste it here.',
          link: 'https://example.com/api-settings',
          linkLabel: 'Open provider API settings',
        })}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Create an API token in the provider settings, then paste it here\./)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', {
        name: 'Create an API token in the provider settings, then paste it here.',
      })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open provider API settings' })).toHaveAttribute(
      'href',
      'https://example.com/api-settings'
    );
  });

  it('shows a friendly label and keeps the raw key in its help text', () => {
    render(
      <ConfigField entry={makeEntry({ key: 'CATALOG_SERVICE_URL' })} value="" onChange={vi.fn()} />
    );

    const input = screen.getByRole('textbox', { name: 'Catalog Service URL' });
    expect(input).toHaveAccessibleDescription(/CATALOG_SERVICE_URL/);
  });

  it('uses an explicit label when one is provided', () => {
    render(
      <ConfigField
        entry={makeEntry({ key: 'CATALOG_SERVICE_URL', label: 'Catalog endpoint' })}
        value=""
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Catalog endpoint')).toBeInTheDocument();
  });

  it('composes a size from its number and unit controls', () => {
    const onChange = vi.fn();
    render(
      <ConfigField
        entry={makeEntry({ inputType: 'size', sizeUnits: ['MB', 'GB'], example: '20MB' })}
        value="20MB"
        onChange={onChange}
      />
    );

    const amount = screen.getByLabelText('Config Key');
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: '30' } });
    fireEvent.blur(amount);
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '30MB');
    fireEvent.change(screen.getByLabelText('Config Key unit'), { target: { value: 'GB' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '20GB');
    expect(screen.queryByText('Example: 20MB')).not.toBeInTheDocument();
  });

  it('composes a duration from its number and unit controls', () => {
    const onChange = vi.fn();
    render(
      <ConfigField
        entry={makeEntry({ inputType: 'time', timeUnits: ['s', 'm', 'h', 'd'], example: '15m' })}
        value="15m"
        onChange={onChange}
      />
    );

    const amount = screen.getByLabelText('Config Key');
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: '30' } });
    fireEvent.blur(amount);
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '30m');
    expect(screen.getByRole('option', { name: 'Minutes' })).toHaveValue('m');
    expect(screen.getByRole('option', { name: 'Hours' })).toHaveValue('h');
    fireEvent.change(screen.getByLabelText('Config Key unit'), { target: { value: 'h' } });
    expect(onChange).toHaveBeenCalledWith('CONFIG_KEY', '15h');
    expect(screen.queryByText('Example: 15m')).not.toBeInTheDocument();
  });
});
