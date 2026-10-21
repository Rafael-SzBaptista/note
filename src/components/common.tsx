import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Item } from '../lib/items';
import { fmtTime } from '../lib/date';
import { Icon } from './Icon';

const SETTLE_MS = 260;

/**
 * Carrossel horizontal de períodos (anterior | atual | próximo). As faixas (`trackRefs`) acompanham
 * o dedo; ao soltar, deslizam até o período vizinho ou voltam. Várias faixas andam juntas
 * (ex.: cabeçalho e corpo da grade de horas). `pageKey` muda quando o período atual muda.
 */
export function useCarousel(onPrev: () => void, onNext: () => void, pageKey: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const tracks = useRef<(HTMLElement | null)[]>([]);
  const trackRefs = useMemo(() => [0, 1, 2].map((i) => (el: HTMLElement | null) => void (tracks.current[i] = el)), []);
  const drag = useRef<{ id: number; x: number; y: number; locked: boolean; last: { x: number; t: number }; v: number } | null>(null);
  const timer = useRef(0);

  const setX = (px: number, animate: boolean) => {
    for (const el of tracks.current) {
      if (!el) continue;
      el.style.transition = animate ? `transform ${SETTLE_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)` : 'none';
      el.style.transform = `translate3d(calc(-100% + ${px}px), 0, 0)`;
    }
  };

  // depois de trocar o período, volta as faixas para o centro sem animar
  useLayoutEffect(() => {
    clearTimeout(timer.current);
    setX(0, false);
  }, [pageKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** dir: 1 = período anterior, -1 = próximo */
  const slide = (dir: 1 | -1) => {
    clearTimeout(timer.current);
    const w = viewport.current?.clientWidth || 1;
    setX(dir * w, true);
    timer.current = window.setTimeout(dir > 0 ? onPrev : onNext, SETTLE_MS);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(timer.current);
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: false, last: { x: e.clientX, t: e.timeStamp }, v: 0 };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          drag.current = null;
          return;
        }
        d.locked = true;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      }
      const dt = e.timeStamp - d.last.t;
      if (dt > 0) d.v = (e.clientX - d.last.x) / dt;
      d.last = { x: e.clientX, t: e.timeStamp };
      setX(dx, false);
    },
    onPointerUp: (e: React.PointerEvent) => finish(e, false),
    onPointerCancel: (e: React.PointerEvent) => finish(e, true),
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.locked) return;
    const w = viewport.current?.clientWidth || 1;
    const dx = e.clientX - d.x;
    const fling = Math.abs(d.v) > 0.5 && Math.abs(dx) > 24;
    const go = !cancelled && (Math.abs(dx) > w * 0.3 || fling);
    if (!go) return setX(0, true);
    slide((fling ? d.v : dx) > 0 ? 1 : -1); // > 0: arrastou para a direita (período anterior)
  };

  return { viewport, trackRefs, handlers, slide };
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
