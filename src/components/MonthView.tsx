import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, sameDay, startOfMonth, startOfWeek, WEEKDAY_LETTER } from '../lib/date';
import { getItems, itemsStartingOn, type Item } from '../lib/items';
import type { State } from '../lib/store';
import { Chip, useSwipe } from './common';

interface Props {
  state: State;
  cursor: Date;
  onDay: (d: Date) => void;
  onItem: (i: Item) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthView({ state, cursor, onDay, onItem, onPrev, onNext }: Props) {
  const first = startOfMonth(cursor);
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
  const swipe = useSwipe(onPrev, onNext);

  return (
    <div className="month" {...swipe}>
      <div className="month-head">
        {WEEKDAY_LETTER.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
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
