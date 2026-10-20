import { useRef, type ReactNode } from 'react';
import type { Item } from '../lib/items';
import { fmtTime } from '../lib/date';
import { Icon } from './Icon';

/** Swipe horizontal para navegar entre períodos. */
export function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx > 0 ? onPrev : onNext)();
    },
  };
}

export const statusLabel = { normal: '', folga: 'Folga', troca: 'Trocado' } as const;

/** Chip compacto usado em mês / dia inteiro. */
export function Chip({ item, onClick, showTime }: { item: Item; onClick?: () => void; showTime?: boolean }) {
  const off = item.status === 'folga' || item.status === 'troca';
  const soft = item.type === 'note' || item.type === 'holiday';
  const cls = ['chip', soft && 'chip-note', off && 'chip-off'].filter(Boolean).join(' ');
  return (
    <button
      className={cls}
      style={{ '--c': item.color } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {item.type === 'note' && <Icon name="notes" size={11} />}
      {item.type === 'extra' && <Icon name="work" size={11} />}
      {item.type === 'cover' && <Icon name="swap" size={11} />}
      <span>
        {showTime && !item.allDay && `${fmtTime(item.start)} `}
        {item.title}
        {item.status && item.status !== 'normal' && ` · ${statusLabel[item.status]}`}
      </span>
    </button>
  );
}

export function Sheet({
  children,
  onClose,
  action,
  title,
  closeIcon = 'close',
}: {
  children: ReactNode;
  onClose: () => void;
  action?: ReactNode;
  title?: string;
  closeIcon?: 'close' | 'back';
}) {
  return (
    <div className="sheet">
      <header className="sheet-bar">
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          <Icon name={closeIcon} />
        </button>
        <div className="sheet-title">{title}</div>
        {action}
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

export function Row({ icon, children, color }: { icon?: Parameters<typeof Icon>[0]['name'] | 'dot'; children: ReactNode; color?: string }) {
  return (
    <div className="row">
      <div className="row-icon">
        {icon === 'dot' ? <span className="dot" style={{ background: color }} /> : icon && <Icon name={icon} />}
      </div>
      <div className="row-main">{children}</div>
    </div>
  );
}
