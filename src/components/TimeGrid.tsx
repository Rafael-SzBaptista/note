import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, fmtTime, pad, sameDay, startOfDay, WEEKDAYS_SHORT } from '../lib/date';
import { getItems, itemsOnDay, type Item } from '../lib/items';
import type { State } from '../lib/store';
import { Chip, statusLabel, useSwipe } from './common';

const HOUR = 48;

interface Props {
  state: State;
  start: Date;
  days: number;
  onItem: (i: Item) => void;
  onCreate: (at: Date) => void;
  onDay: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}

interface Seg {
  item: Item;
  top: number;
  height: number;
  col: number;
  cols: number;
  startsBefore: boolean;
}

/** Posiciona itens sobrepostos lado a lado. */
function layout(day: Date, list: Item[]): Seg[] {
  const d0 = startOfDay(day).getTime();
  const d1 = addDays(day, 1).getTime();
  const segs = list
    .map((item) => {
      const s = Math.max(item.start.getTime(), d0);
      const e = Math.min(item.end.getTime(), d1);
      return { item, s, e };
    })
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: Seg[] = [];
  let cluster: { s: number; e: number; col: number; item: Item }[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) {
      const top = ((c.s - d0) / 36e5) * HOUR;
      out.push({
        item: c.item,
        top,
        height: Math.max(20, ((c.e - c.s) / 36e5) * HOUR - 2),
        col: c.col,
        cols,
        startsBefore: c.item.start.getTime() < d0,
      });
    }
    cluster = [];
  };
  for (const x of segs) {
    if (cluster.length && x.s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.e > x.s).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...x, col });
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  flush();
  return out;
}

export function TimeGrid({ state, start, days, onItem, onCreate, onDay, onPrev, onNext }: Props) {
  const from = startOfDay(start);
  const to = addDays(from, days);
  const items = useMemo(() => getItems(state, from, to), [state, from.getTime(), days]);
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const swipe = useSwipe(onPrev, onNext);
  const scroller = useRef<HTMLDivElement>(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60e3);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR * 6.5;
  }, []);

  const allDay = items.filter((i) => i.allDay);
  const timed = items.filter((i) => !i.allDay);

  return (
    <div className="tg" {...swipe}>
      <div className="tg-head">
        <div className="tg-gutter" />
        {dayList.map((d) => (
          <button key={d.getTime()} className={`tg-day${sameDay(d, now) ? ' today' : ''}`} onClick={() => onDay(d)}>
            <span className="wd">{WEEKDAYS_SHORT[d.getDay()]}</span>
            <span className="n">{d.getDate()}</span>
          </button>
        ))}
      </div>
      {allDay.length > 0 && (
        <div className="tg-allday">
          <div className="tg-gutter" />
          {dayList.map((d) => (
            <div key={d.getTime()} className="tg-allday-col">
              {itemsOnDay(allDay, d).map((it) => (
                <Chip key={it.key} item={it} onClick={() => onItem(it)} />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ height: HOUR * 24 }}>
          <div className="tg-gutter tg-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{ top: h * HOUR }}>
                {h > 0 && `${pad(h)}:00`}
              </div>
            ))}
          </div>
          {dayList.map((d) => (
            <div
              key={d.getTime()}
              className="tg-col"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const mins = Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30;
                const at = new Date(d);
                at.setHours(0, mins, 0, 0);
                onCreate(at);
              }}
            >
              {layout(d, itemsOnDay(timed, d)).map((s) => {
                const it = s.item;
                return (
                  <button
                    key={it.key}
                    className={`tg-ev${it.status === 'folga' || it.status === 'troca' ? ' off' : ''}`}
                    style={
                      {
                        '--c': it.color,
                        top: s.top,
                        height: s.height,
                        left: `calc(${(s.col / s.cols) * 100}% + 1px)`,
                        width: `calc(${100 / s.cols}% - 3px)`,
                      } as React.CSSProperties
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onItem(it);
                    }}
                  >
                    <strong>
                      {it.title}
                      {it.turno && ` · ${it.turno}`}
                      {it.status && it.status !== 'normal' && ` · ${statusLabel[it.status]}`}
                    </strong>
                    {s.height > 34 && (
                      <span>
                        {s.startsBefore ? '… ' : ''}
                        {fmtTime(it.start)} – {fmtTime(it.end)}
                      </span>
                    )}
                  </button>
                );
              })}
              {sameDay(d, now) && (
                <div className="now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
