import { describe, expect, it } from 'vitest';
import { COLUMN_KEYS, DEFAULT_COLUMNS, toggleColumn, visibleColumns } from './columns';

describe('columns', () => {
  it('shows every column by default, name first', () => {
    expect(COLUMN_KEYS[0]).toBe('name');
    expect(visibleColumns(DEFAULT_COLUMNS)).toEqual(COLUMN_KEYS);
  });

  it('hides and shows a column', () => {
    const hidden = toggleColumn(DEFAULT_COLUMNS, 'uploadedBy');
    expect(hidden.uploadedBy).toBe(false);
    expect(visibleColumns(hidden)).not.toContain('uploadedBy');
    expect(toggleColumn(hidden, 'uploadedBy').uploadedBy).toBe(true);
  });

  it('never hides the name column', () => {
    expect(toggleColumn(DEFAULT_COLUMNS, 'name')).toBe(DEFAULT_COLUMNS);
    expect(visibleColumns({ ...DEFAULT_COLUMNS, name: false })).toContain('name');
  });
});
