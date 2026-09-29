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
      title={ascending ? 'За зростанням — натисніть, щоб змінити' : 'За спаданням — натисніть, щоб змінити'}
      className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide hover:text-brass-2"
    >
      {label}
      {ascending ? <ArrowDownAZ size={16} /> : <ArrowDownZA size={16} />}
    </button>
  );
}
