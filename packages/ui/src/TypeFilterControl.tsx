import { TypeFilter } from '@shelf/shared';
import { cn } from './cn';

const OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: TypeFilter.ALL_FILES, label: 'Усі файли' },
  { value: TypeFilter.ONLY_CPP, label: 'Лише .cpp' },
  { value: TypeFilter.ONLY_PNG, label: 'Лише .png' },
];

/** «boundary» TypeFilterControl: all files / only .cpp / only .png (UC6). */
export function TypeFilterControl({ filter, onFilterSelect }: { filter: TypeFilter; onFilterSelect: (filter: TypeFilter) => void }) {
  return (
    <div role="group" aria-label="Фільтр за типом" className="inline-flex rounded-lg border border-line bg-paper p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={filter === option.value}
          data-testid={`filter-${option.value}`}
          onClick={() => onFilterSelect(option.value)}
          className={cn(
            'h-8 rounded-md px-3 text-sm transition-colors',
            filter === option.value ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:bg-paper-2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
