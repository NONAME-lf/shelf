'use client';

import { defaultSide, formatDateTime, formatSize, Side, type SyncItem } from '@shelf/shared';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { Modal } from './Modal';

export type ConflictDialogProps = {
  items: SyncItem[] | null;
  onConfirm: (resolutions: Record<string, Side>) => void;
  onCancel: () => void;
};

function SideOption(props: { name: string; side: Side; checked: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2',
        props.checked ? 'border-brass bg-brass-soft/60' : 'border-line hover:bg-paper',
      )}
    >
      <input
        type="radio"
        name={`conflict-${props.name}`}
        className="mt-1 accent-brass"
        checked={props.checked}
        onChange={props.onSelect}
        data-testid={`conflict-${props.side}`}
      />
      <span>
        <span className="block font-medium">{props.title}</span>
        <span className="block text-xs text-muted">{props.detail}</span>
      </span>
    </label>
  );
}

/** UC14b: for every conflicting file the user keeps the local or the server version; the newer one is preselected. */
export function ConflictDialog({ items, onConfirm, onCancel }: ConflictDialogProps) {
  const [choice, setChoice] = useState<Record<string, Side>>({});

  useEffect(() => {
    if (items) setChoice(Object.fromEntries(items.map((item) => [item.name, defaultSide(item) ?? Side.REMOTE])));
  }, [items]);

  return (
    <Modal
      open={items !== null}
      title="Конфлікти версій"
      onClose={onCancel}
      wide
      testId="conflict-dialog"
      footer={
        <>
          <Button onClick={onCancel} data-testid="conflict-cancel">
            Скасувати синхронізацію
          </Button>
          <Button variant="primary" onClick={() => onConfirm(choice)} data-testid="conflict-apply">
            Застосувати
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Ці файли змінилися і в локальній папці, і на сервері після останньої синхронізації. Оберіть, яку версію залишити;
        новішу позначено за замовчуванням.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-1 pr-3">Файл</th>
            <th className="py-1 pr-3">Локальна версія</th>
            <th className="py-1">Версія на сервері</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((item) => (
            <tr key={item.name} data-testid="conflict-row" data-name={item.name} className="align-top">
              <td className="py-2 pr-3 font-medium">{item.name}</td>
              <td className="py-2 pr-3">
                <SideOption
                  name={item.name}
                  side={Side.LOCAL}
                  checked={choice[item.name] === Side.LOCAL}
                  onSelect={() => setChoice((current) => ({ ...current, [item.name]: Side.LOCAL }))}
                  title="Залишити локальну"
                  detail={item.local ? `${formatDateTime(item.local.modifiedAt)}, ${formatSize(item.local.size)}` : '—'}
                />
              </td>
              <td className="py-2">
                <SideOption
                  name={item.name}
                  side={Side.REMOTE}
                  checked={choice[item.name] === Side.REMOTE}
                  onSelect={() => setChoice((current) => ({ ...current, [item.name]: Side.REMOTE }))}
                  title="Залишити з сервера"
                  detail={item.remote ? `${formatDateTime(item.remote.modifiedAt)}, ${formatSize(item.remote.size)}` : '—'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
