import { formatDateTime, type SyncReport } from '@shelf/shared';
import { ArrowDown, ArrowUp, Check, TriangleAlert } from 'lucide-react';
import { cn } from './cn';

export function SyncReportView({ report, syncedAt, compact }: { report: SyncReport; syncedAt?: string | null; compact?: boolean }) {
  const rows = [
    { label: 'Завантажено на сервер', value: report.uploaded, Icon: ArrowUp },
    { label: 'Скачано з сервера', value: report.downloaded, Icon: ArrowDown },
    { label: 'Без змін', value: report.skipped, Icon: Check },
    { label: 'Конфліктів', value: report.conflicts, Icon: TriangleAlert },
  ];
  return (
    <div
      data-testid="sync-report"
      className={cn('rounded-md text-sm', compact ? 'bg-ink-3/50 p-2 text-paper/90' : 'border border-line bg-white p-3')}
    >
      {syncedAt ? <div className="mb-1 text-xs opacity-70">Остання синхронізація: {formatDateTime(syncedAt)}</div> : null}
      <ul className={cn('grid gap-x-2 gap-y-1', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        {rows.map(({ label, value, Icon }) => (
          <li key={label} className="flex items-center gap-1.5">
            <Icon size={14} className="shrink-0 opacity-80" />
            <span>
              {label}: <b>{value}</b>
            </span>
          </li>
        ))}
      </ul>
      {report.errors.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-red-300">
          {report.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
