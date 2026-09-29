import { SortDirection, toggleDirection } from '@shelf/shared';
import { ArrowDownAZ, ArrowDownZA } from 'lucide-react';

export type SortHeaderControlProps = {
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
  label?: string;
};

/** «boundary» SortHeaderControl: a click on the «Назва» header toggles the direction (UC5). */
export function SortHeaderControl({ direction, onDirectionChange, label = 'Назва' }: SortHeaderControlProps) {
  const ascending = direction === SortDirection.ASCENDING;
  const onHeaderClick = () => onDirectionChange(toggleDirection(direction));
  return (
    <button
      type="button"
      onClick={onHeaderClick}
      data-testid="sort-name"
      data-direction={direction}
      aria-label={ascending ? 'Сортувати за назвою: за зростанням' : 'Сортувати за назвою: за спаданням'}
      title={ascending ? 'Сортувати за назвою: за зростанням' : 'Сортувати за назвою: за спаданням'}
      className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide hover:text-brass-2"
    >
      {label}
      {ascending ? <ArrowDownAZ size={18} /> : <ArrowDownZA size={18} />}
    </button>
  );
}
