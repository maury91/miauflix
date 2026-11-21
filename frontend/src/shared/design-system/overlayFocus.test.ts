import { isEditing } from './overlayFocus';

describe('isEditing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const focusInput = (type: string) => {
    const input = document.createElement('input');
    input.type = type;
    document.body.append(input);
    input.focus();
  };

  it.each(['text', 'search', 'email', 'password', 'number'])('is true in a %s field', type => {
    focusInput(type);
    expect(isEditing()).toBe(true);
  });

  it('is true in a textarea', () => {
    const area = document.createElement('textarea');
    document.body.append(area);
    area.focus();
    expect(isEditing()).toBe(true);
  });

  // Back must still close the overlay: a slider in a popover kept it open
  it.each(['range', 'checkbox', 'radio', 'button'])('is false on a %s input', type => {
    focusInput(type);
    expect(isEditing()).toBe(false);
  });

  it('is false on a button', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    expect(isEditing()).toBe(false);
  });
});
