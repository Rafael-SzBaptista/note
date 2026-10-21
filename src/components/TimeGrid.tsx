import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, fmtTime, pad, sameDay, startOfDay, WEEKDAYS_SHORT } from '../lib/date';
import { getItems, itemsOnDay, type Item } from '../lib/items';
import type { State } from '../lib/store';
import { Chip, statusLabel, useCarousel } from './common';

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

/**
 * Grade de horas com os períodos lado a lado (anterior | atual | próximo). Cabeçalho, faixa de
 * dia inteiro e colunas deslizam juntos com o dedo; a coluna de horas e a rolagem vertical ficam.
 */
export function TimeGrid({ state, start, days, onItem, onCreate, onDay, onPrev, onNext }: Props) {
  const from = startOfDay(start);
  const items = useMemo(
    () => getItems(state, addDays(from, -days), addDays(from, 2 * days)),
    [state, from.getTime(), days],
  );
  const { viewport, trackRefs, handlers } = useCarousel(onPrev, onNext, from.getTime());
  const pages = [-1, 0, 1].map((p) => Array.from({ length: days }, (_, i) => addDays(from, p * days + i)));
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
  // a faixa existe se algum dos três períodos tiver itens de dia inteiro, para não pular ao deslizar
  const showAllDay = pages.some((dl) => dl.some((d) => itemsOnDay(allDay, d).length > 0));

  return (
    <div className="tg" {...handlers}>
      <div className="tg-head">
        <div className="tg-gutter" />
        <div className="tg-vp">
          <div className="tg-track" ref={trackRefs[0]}>
            {pages.map((dl, p) => (
              <div key={p} className="tg-page">
                {dl.map((d) => (
                  <button key={d.getTime()} className={`tg-day${sameDay(d, now) ? ' today' : ''}`} onClick={() => onDay(d)}>
                    <span className="wd">{WEEKDAYS_SHORT[d.getDay()]}</span>
                    <span className="n">{d.getDate()}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showAllDay && (
        <div className="tg-allday">
          <div className="tg-gutter" />
          <div className="tg-vp">
            <div className="tg-track" ref={trackRefs[1]}>
              {pages.map((dl, p) => (
                <div key={p} className="tg-page">
                  {dl.map((d) => (
                    <div key={d.getTime()} className="tg-allday-col">
                      {itemsOnDay(allDay, d).map((it) => (
                        <Chip key={it.key} item={it} onClick={() => onItem(it)} />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
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
          <div className="tg-vp" ref={viewport}>
            <div className="tg-track" ref={trackRefs[2]}>
              {pages.map((dl, p) => (
                <div key={p} className="tg-page">
                  {dl.map((d) => (
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
