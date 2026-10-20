import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, fmtTime, MONTHS, sameDay, startOfMonth, WEEKDAYS_SHORT } from '../lib/date';
import { getItems, itemsStartingOn, type Item } from '../lib/items';
import type { State } from '../lib/store';
import { statusLabel } from './common';
import { Icon } from './Icon';

interface Props {
  state: State;
  cursor: Date;
  onItem: (i: Item) => void;
  onDay: (d: Date) => void;
}

// Cada mês ganha um banner com degradê próprio, como as ilustrações do app de agenda.
const BANNERS = [
  ['#4f7cff', '#9ad0ff'], ['#ff7a9c', '#ffc1d0'], ['#2fb37a', '#a6e8c4'], ['#f6a623', '#ffe08a'],
  ['#7a5cff', '#c8b8ff'], ['#00a0b0', '#9fe6ea'], ['#ff8a3d', '#ffd1a8'], ['#e04f5f', '#ffb3b3'],
  ['#c27c2c', '#f4d29c'], ['#e86a28', '#ffc48a'], ['#6b7c93', '#c9d3e0'], ['#2e7d32', '#a5d6a7'],
];

export function AgendaView({ state, cursor, onItem, onDay }: Props) {
  const [months, setMonths] = useState(3);
  const from = startOfMonth(cursor);
  const to = addMonths(from, months);
  const items = useMemo(() => getItems(state, from, to), [state, from.getTime(), to.getTime()]);
  const today = new Date();
  const scroller = useRef<HTMLDivElement>(null);

  const sections: { month: Date; days: { d: Date; list: Item[] }[] }[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (d.getDate() === 1) sections.push({ month: d, days: [] });
    const list = itemsStartingOn(items, d);
    if (list.length || sameDay(d, today) || sameDay(d, cursor)) sections[sections.length - 1].days.push({ d, list });
  }

  useEffect(() => {
    const el = scroller.current?.querySelector('[data-focus="1"]') as HTMLElement | null;
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 8;
  }, [cursor.getTime()]);

  return (
    <div className="agenda" ref={scroller}>
      {sections.map(({ month, days }) => {
        const [a, b] = BANNERS[month.getMonth()];
        return (
          <section key={month.getTime()}>
            <div className="banner" style={{ background: `linear-gradient(120deg, ${a}, ${b})` }}>
              <span>
                {MONTHS[month.getMonth()]} {month.getFullYear() !== today.getFullYear() && month.getFullYear()}
              </span>
            </div>
            {days.map(({ d, list }) => {
              const isToday = sameDay(d, today);
              return (
                <div key={d.getTime()} className="aday" data-focus={sameDay(d, cursor) ? '1' : undefined}>
                  <button className={`aday-date${isToday ? ' today' : ''}`} onClick={() => onDay(d)}>
                    <span className="wd">{WEEKDAYS_SHORT[d.getDay()]}</span>
                    <span className="n">{d.getDate()}</span>
                  </button>
                  <div className="aday-list">
                    {list.length === 0 && <div className="aday-empty">Nada planejado</div>}
                    {list.map((it) => (
                      <button
                        key={it.key}
                        className={`acard${it.type === 'note' || it.type === 'holiday' ? ' note' : ''}${it.status === 'folga' || it.status === 'troca' ? ' off' : ''}`}
                        style={{ '--c': it.color } as React.CSSProperties}
                        onClick={() => onItem(it)}
                      >
                        <div className="acard-title">
                          {it.type === 'note' && <Icon name="notes" size={14} />}
                          {it.type === 'extra' && <Icon name="work" size={14} />}
                          {it.type === 'shift' && <Icon name="repeat" size={14} />}
                          {it.type === 'cover' && <Icon name="swap" size={14} />}
                          {it.type === 'holiday' && <Icon name="flag" size={14} />}
                          <span>
                            {it.title}
                            {it.turno && ` · ${it.turno}`}
                          </span>
                          {it.status && it.status !== 'normal' && <em className="badge">{statusLabel[it.status]}</em>}
                        </div>
                        {!it.allDay && (
                          <div className="acard-sub">
                            {fmtTime(it.start)} – {fmtTime(it.end)}
                            {!sameDay(it.start, it.end) && ' (+1)'}
                            {it.location && ` · ${it.location}`}
                          </div>
                        )}
                        {it.note && <div className="acard-sub">{it.note}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <button className="load-more" onClick={() => setMonths((m) => m + 3)}>
        Carregar mais
      </button>
    </div>
  );
}
