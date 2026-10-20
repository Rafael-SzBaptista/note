import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, sameDay, startOfMonth, startOfWeek, WEEKDAY_LETTER } from '../lib/date';
import { getItems, itemsStartingOn, type Item } from '../lib/items';
import type { State } from '../lib/store';
import { Chip } from './common';

interface Props {
  state: State;
  cursor: Date;
  onDay: (d: Date) => void;
  onItem: (i: Item) => void;
  onPrev: () => void;
  onNext: () => void;
}

const SETTLE_MS = 260;

function MonthPage({ state, month, onDay, onItem }: { state: State; month: Date; onDay: Props['onDay']; onItem: Props['onItem'] }) {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
  const days = Array.from({ length: rows * 7 }, (_, i) => addDays(gridStart, i));
  const items = useMemo(() => getItems(state, gridStart, addDays(gridStart, rows * 7)), [state, gridStart.getTime(), rows]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [maxChips, setMaxChips] = useState(3);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cellH = el.clientHeight / rows;
      setMaxChips(Math.max(1, Math.floor((cellH - 24) / 17)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  const today = new Date();
  return (
    <div className="month-page">
      <div className="month-grid" ref={gridRef} style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {days.map((d) => {
          const list = itemsStartingOn(items, d);
          const overflow = list.length > maxChips;
          const shown = overflow ? list.slice(0, maxChips - 1) : list;
          const out = d.getMonth() !== first.getMonth();
          return (
            <div key={d.getTime()} className={`cell${out ? ' out' : ''}`} onClick={() => onDay(d)}>
              <span className={`num${sameDay(d, today) ? ' today' : ''}`}>{d.getDate()}</span>
              {shown.map((it) => (
                <Chip key={it.key} item={it} onClick={() => onItem(it)} />
              ))}
              {overflow && <span className="more">+{list.length - shown.length}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Meses lado a lado numa faixa horizontal (anterior | atual | próximo).
 * A faixa acompanha o dedo; ao soltar, desliza até o mês vizinho ou volta.
 */
export function MonthView({ state, cursor, onDay, onItem, onPrev, onNext }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; locked: boolean; last: { x: number; t: number }; v: number } | null>(null);
  const timer = useRef(0);

  const setX = (px: number, animate: boolean) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${SETTLE_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)` : 'none';
    el.style.transform = `translate3d(calc(-100% + ${px}px), 0, 0)`;
  };

  // depois de trocar o mês, volta a faixa para o centro sem animar
  const monthKey = cursor.getFullYear() * 12 + cursor.getMonth();
  useLayoutEffect(() => {
    clearTimeout(timer.current);
    setX(0, false);
  }, [monthKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearTimeout(timer.current);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: false, last: { x: e.clientX, t: e.timeStamp }, v: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
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
      viewport.current?.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - d.last.t;
    if (dt > 0) d.v = (e.clientX - d.last.x) / dt;
    d.last = { x: e.clientX, t: e.timeStamp };
    setX(dx, false);
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
    const dir = (fling ? d.v : dx) > 0 ? 1 : -1; // 1 = arrastou para a direita (mês anterior)
    setX(dir * w, true);
    timer.current = window.setTimeout(dir > 0 ? onPrev : onNext, SETTLE_MS);
  };

  const pages = [addMonths(cursor, -1), cursor, addMonths(cursor, 1)];

  return (
    <div className="month">
      <div className="month-head">
        {WEEKDAY_LETTER.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div
        className="month-viewport"
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      >
        <div className="month-track" ref={track}>
          {pages.map((m, i) => (
            <MonthPage key={i} state={state} month={m} onDay={onDay} onItem={onItem} />
          ))}
        </div>
      </div>
    </div>
  );
}
