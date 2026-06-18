// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('./state', () => ({
  get: vi.fn(),
}));

vi.mock('./search', () => ({
  registerSearchEntry: vi.fn(),
}));

import * as state from './state';
import { createChipListControl, createSelectControl, createTextControl } from './controls';

describe('theme configurator control transforms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('select control formats and parses values for editor-friendly display', () => {
    vi.mocked(state.get).mockReturnValue(10 * 1024 * 1024);
    const onChange = vi.fn();

    const control = createSelectControl(
      {
        id: 'attach-max-size',
        label: 'Max File Size',
        type: 'select',
        path: 'attachments.maxFileSize',
        defaultValue: 10 * 1024 * 1024,
        options: [
          { value: '1', label: '1 MB' },
          { value: '10', label: '10 MB' },
          { value: '25', label: '25 MB' },
        ],
        formatValue: (value: number) => String(value / (1024 * 1024)),
        parseValue: (value: string) => Number(value) * 1024 * 1024,
      } as any,
      onChange
    );

    const select = control.element.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('10');

    select.value = '25';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith('attachments.maxFileSize', 25 * 1024 * 1024);
  });

  test('text control formats and parses JSON-backed values', () => {
    vi.mocked(state.get).mockReturnValue(['Hi', 'Help']);
    const onChange = vi.fn();

    const control = createTextControl(
      {
        id: 'suggestions-json',
        label: 'Chips',
        type: 'text',
        path: 'suggestionChips',
        defaultValue: [],
        formatValue: (value: string[]) => JSON.stringify(value),
        parseValue: (value: string) => JSON.parse(value),
      } as any,
      onChange
    );

    const input = control.element.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('["Hi","Help"]');

    input.value = '["A","B","C"]';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith('suggestionChips', ['A', 'B', 'C']);
  });

  test('chip list control supports blank draft rows while emitting only non-empty chips', () => {
    vi.mocked(state.get).mockReturnValue(['Hi', 'Help']);
    const onChange = vi.fn();

    const control = createChipListControl(
      {
        id: 'suggestion-chips',
        label: 'Suggestion Chips',
        type: 'chip-list',
        path: 'suggestionChips',
        defaultValue: [],
      } as any,
      onChange
    );

    const inputs = () => Array.from(control.element.querySelectorAll('.chip-item input')) as HTMLInputElement[];
    const buttons = () => Array.from(control.element.querySelectorAll('.delete-chip')) as HTMLButtonElement[];
    const addButton = control.element.querySelector('.add-button') as HTMLButtonElement;

    expect(inputs().map(input => input.value)).toEqual(['Hi', 'Help']);

    addButton.click();
    expect(onChange).toHaveBeenLastCalledWith('suggestionChips', ['Hi', 'Help']);
    expect(inputs().map(input => input.value)).toEqual(['Hi', 'Help', '']);
    expect(inputs()[2]?.placeholder).toBe('Type suggestion...');

    const editedInput = inputs()[2];
    editedInput.value = 'Pricing';
    editedInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith('suggestionChips', ['Hi', 'Help', 'Pricing']);

    buttons()[1].click();
    expect(onChange).toHaveBeenLastCalledWith('suggestionChips', ['Hi', 'Pricing']);
    expect(inputs().map(input => input.value)).toEqual(['Hi', 'Pricing']);
  });
});
