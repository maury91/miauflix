import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Alert } from './alert/Alert';
import { Button } from './button/Button';
import { FieldLabel, Input } from './form-controls/FormControls';
import { Switch } from './switch/Switch';

describe('UI control contracts', () => {
  it('keeps utility buttons from submitting a form, and submits only enabled submit actions', () => {
    const submit = vi.fn(event => event.preventDefault());
    const ref = createRef<HTMLButtonElement>();
    render(
      <form onSubmit={submit}>
        <Button ref={ref} appearance="settings" size="small">
          Utility
        </Button>
        <Button type="submit">Save</Button>
        <Button type="submit" disabled>
          Disabled
        </Button>
      </form>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Utility' }));
    expect(submit).not.toHaveBeenCalled();
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Utility' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(ref.current).not.toHaveAttribute('appearance');
    expect(ref.current).not.toHaveAttribute('size');
  });

  it('preserves native input validation, label and ref alongside error feedback', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" ref={ref} type="email" required invalid aria-describedby="email-error" />
        <p id="email-error">A valid email is required.</p>
      </>
    );
    const input = screen.getByLabelText('Email');
    expect(ref.current).toBe(input);
    expect(input).toHaveAccessibleDescription('A valid email is required.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(ref.current?.checkValidity()).toBe(false);
    fireEvent.change(input, { target: { value: 'viewer@example.com' } });
    expect(ref.current?.checkValidity()).toBe(true);
  });

  it('requests controlled switch changes, supports cancellation, and blocks disabled activation', () => {
    const changed = vi.fn();
    const { rerender } = render(
      <Switch aria-label="Episode syncing" checked={false} onCheckedChange={changed} />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(changed).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(
      <Switch
        aria-label="Episode syncing"
        checked
        onCheckedChange={changed}
        onClick={event => event.preventDefault()}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(changed).toHaveBeenCalledTimes(1);
    rerender(<Switch aria-label="Episode syncing" checked disabled onCheckedChange={changed} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('announces failures assertively and successful actions politely', () => {
    const { rerender } = render(<Alert severity="error">Unable to save</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save');
    rerender(<Alert severity="success">Saved</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
