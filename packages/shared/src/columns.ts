export type ColumnKey = 'name' | 'extension' | 'size' | 'createdAt' | 'modifiedAt' | 'uploadedBy' | 'editedBy';

export const COLUMN_KEYS: readonly ColumnKey[] = [
  'name',
  'extension',
  'size',
  'createdAt',
  'modifiedAt',
  'uploadedBy',
  'editedBy',
];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: 'Назва',
  extension: 'Тип',
  size: 'Розмір',
  createdAt: 'Дата створення',
  modifiedAt: 'Дата зміни',
  uploadedBy: 'Хто завантажив',
  editedBy: 'Хто редагував',
};

export type ColumnVisibility = Record<ColumnKey, boolean>;

export const DEFAULT_COLUMNS: ColumnVisibility = {
  name: true,
  extension: true,
  size: true,
  createdAt: true,
  modifiedAt: true,
  uploadedBy: true,
  editedBy: true,
};

/** Shows or hides a column; the name column cannot be hidden (requirement R3). */
export function toggleColumn(visibility: ColumnVisibility, key: ColumnKey): ColumnVisibility {
  if (key === 'name') return visibility;
  return { ...visibility, [key]: !visibility[key] };
}

export function visibleColumns(visibility: ColumnVisibility): ColumnKey[] {
  return COLUMN_KEYS.filter((key) => key === 'name' || visibility[key]);
}
