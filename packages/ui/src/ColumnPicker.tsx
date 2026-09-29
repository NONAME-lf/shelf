'use client';

import { COLUMN_KEYS, COLUMN_LABELS, type ColumnKey, type ColumnVisibility } from '@shelf/shared';

/** Show / hide every column except the name (UC7). Styled for the dark sidebar. */
export function ColumnPicker({ columns, onToggle }: { columns: ColumnVisibility; onToggle: (key: ColumnKey) => void }) {
  return (
    <ul className="space-y-0.5">
      {COLUMN_KEYS.filter((key) => key !== 'name').map((key) => (
        <li key={key}>
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-paper/90 hover:bg-white/5">
            <input
              type="checkbox"
              className="accent-brass"
              checked={columns[key]}
              onChange={() => onToggle(key)}
              data-testid={`column-${key}`}
            />
            {COLUMN_LABELS[key]}
          </label>
        </li>
      ))}
    </ul>
  );
}
