import { useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, fmtHours, fmtLongDate, fmtShortDate, fmtTime, sameDay, startOfDay, startOfMonth, WEEKDAYS } from '../lib/date';
import { findConflicts } from '../lib/conflicts';
import { getItems, isWork, itemsStartingOn, type Item } from '../lib/items';
import { brl, summarize } from '../lib/money';
import type { State } from '../lib/store';
import { statusLabel } from './common';
import { Icon } from './Icon';

/** "em 3h20", "em 2 dias", "amanhã" */
function until(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60e3));
  if (mins < 60) return `em ${mins} min`;
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 864e5);
  if (days === 0 || mins < 12 * 60) return `em ${Math.floor(mins / 60)}h${mins % 60 ? String(mins % 60).padStart(2, '0') : ''}`;
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

const left = (from: Date, to: Date) => {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60e3));
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
};

export function HojeView({
  state,
  onItem,
  onResumo,
  onSettings,
  onNewEscala,
}: {
  state: State;
  onItem: (i: Item) => void;
  onResumo: () => void;
  onSettings: () => void;
  onNewEscala: () => void;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30e3);
    return () => clearInterval(t);
  }, []);
  const today = startOfDay(now);
  const minuteKey = Math.floor(now.getTime() / 60e3);

  const { work, todayItems, current, next, nextFolga } = useMemo(() => {
    const items = getItems(state, addDays(today, -2), addDays(today, 90));
    const work = items.filter(isWork);
    const current = work.find((i) => i.start <= now && i.end > now) ?? null;
    const next = work.find((i) => i.start > now) ?? null;
    // folga = dia sem plantão começando nele e sem passar mais de 4h dentro de outro plantão
    let nextFolga: Date | null = null;
    for (let d = today; d < addDays(today, 90); d = addDays(d, 1)) {
      const e = addDays(d, 1);
      const busy = work.some((i) => {
        const ov = (Math.min(i.end.getTime(), e.getTime()) - Math.max(i.start.getTime(), d.getTime())) / 3600e3;
        return (i.start >= d && i.start < e) || ov >= 4;
      });
      if (!busy) {
        nextFolga = d;
        break;
      }
    }
    return { work, todayItems: itemsStartingOn(items, today), current, next, nextFolga };
  }, [state, minuteKey]);

  const month = startOfMonth(now);
  const sum = useMemo(() => summarize(state, month, addMonths(month, 1)), [state, month.getTime()]);
  const done = useMemo(
    () => work.filter((i) => i.end <= now && i.start >= month).length,
    [work, minuteKey],
  );
  const alerts = useMemo(() => findConflicts(state, now, addDays(now, 30)), [state, today.getTime()]);

  const hour = now.getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const todayWork = work.filter((i) => sameDay(i.start, now) && i.start > now);

  let hero;
  if (current) {
    const pct = ((now.getTime() - current.start.getTime()) / (current.end.getTime() - current.start.getTime())) * 100;
    hero = (
      <button className="hero" style={{ '--c': current.color } as React.CSSProperties} onClick={() => onItem(current)}>
        <span className="hero-k">Em plantão agora</span>
        <strong>{current.title}{current.turno && ` · ${current.turno}`}</strong>
        <span>
          Termina às {fmtTime(current.end)}
          {!sameDay(current.end, now) && ` de ${fmtShortDate(current.end)}`} · faltam {left(now, current.end)}
        </span>
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </button>
    );
  } else if (todayWork.length) {
    const t = todayWork[0];
    hero = (
      <button className="hero" style={{ '--c': t.color } as React.CSSProperties} onClick={() => onItem(t)}>
        <span className="hero-k">Você trabalha hoje</span>
        <strong>{t.title}{t.turno && ` · ${t.turno}`}</strong>
        <span>
          {fmtTime(t.start)} – {fmtTime(t.end)} · começa {until(now, t.start)}
        </span>
      </button>
    );
  } else {
    hero = (
      <div className="hero off">
        <span className="hero-k">Hoje</span>
        <strong>Folga 🎉</strong>
        <span>{next ? `Próximo plantão ${until(now, next.start)}` : 'Nenhum plantão agendado'}</span>
      </div>
    );
  }

  const afterCurrent = current ? work.find((i) => i.start >= current.end) : next;

  return (
    <div className="hoje">
      <div className="greet">
        <h2>{greet}!</h2>
        <span className="muted">{fmtLongDate(now)}</span>
      </div>

      {state.escalas.length === 0 && (
        <button className="card cta" onClick={onNewEscala}>
          <Icon name="repeat" />
          <div>
            <strong>Crie sua escala</strong>
            <span className="muted small">12x36, 24x48, 6x1, ciclos… os plantões aparecem sozinhos.</span>
          </div>
        </button>
      )}

      {hero}

      <div className="tiles">
        <button className="tile" onClick={() => afterCurrent && onItem(afterCurrent)} disabled={!afterCurrent}>
          <span className="tile-k">Próximo plantão</span>
          {afterCurrent ? (
            <>
              <strong>{sameDay(afterCurrent.start, now) ? 'Hoje' : WEEKDAYS[afterCurrent.start.getDay()].split('-')[0]}</strong>
              <span>
                {fmtShortDate(afterCurrent.start).split(', ')[1]} · {fmtTime(afterCurrent.start)}
              </span>
            </>
          ) : (
            <strong>—</strong>
          )}
        </button>
        <div className="tile">
          <span className="tile-k">Próxima folga</span>
          {nextFolga ? (
            <>
              <strong>{sameDay(nextFolga, now) ? 'Hoje' : WEEKDAYS[nextFolga.getDay()].split('-')[0]}</strong>
              <span>
                {sameDay(nextFolga, now)
                  ? 'aproveite!'
                  : `${fmtShortDate(nextFolga).split(', ')[1]} · ${until(today, nextFolga)}`}
              </span>
            </>
          ) : (
            <strong>—</strong>
          )}
        </div>
      </div>

      <button className="card month-card" onClick={onResumo}>
        <div className="card-head">
          <span>Este mês</span>
          <Icon name="right" size={20} />
        </div>
        <div className="mc-grid">
          <div>
            <strong>
              {done}
              <small>/{sum.count}</small>
            </strong>
            <span>plantões feitos</span>
          </div>
          <div>
            <strong>{fmtHours(sum.hours)}</strong>
            <span>no mês</span>
          </div>
          {sum.total > 0 && (
            <>
              <div>
                <strong className="money">{brl(sum.total)}</strong>
                <span>previsto</span>
              </div>
              <div>
                <strong className="money">{brl(sum.total - sum.received)}</strong>
                <span>a receber</span>
              </div>
            </>
          )}
        </div>
      </button>

      {alerts.length > 0 && (
        <div className="card warn-card">
          <div className="card-head">
            <span>
              <Icon name="warning" size={18} /> Alertas nos próximos 30 dias
            </span>
          </div>
          {alerts.slice(0, 5).map((c, i) => (
            <button key={i} className="alert-row" onClick={() => onItem(c.b)}>
              <strong>{fmtShortDate(c.b.start)}</strong>
              <span>
                {c.kind === 'overlap'
                  ? `${c.a.title} e ${c.b.title} se sobrepõem`
                  : `Só ${Math.round(c.gap * 10) / 10}h de descanso entre ${c.a.title} e ${c.b.title}`}
              </span>
            </button>
          ))}
          {alerts.length > 5 && <div className="muted small pad-x">+{alerts.length - 5} alertas</div>}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span>Agenda de hoje</span>
        </div>
        {todayItems.length === 0 && <div className="muted pad-x small">Nada para hoje.</div>}
        <div className="today-list">
          {todayItems.map((it) => (
            <button
              key={it.key}
              className={`acard${it.type === 'note' || it.type === 'holiday' ? ' note' : ''}${it.status === 'folga' || it.status === 'troca' ? ' off' : ''}`}
              style={{ '--c': it.color } as React.CSSProperties}
              onClick={() => onItem(it)}
            >
              <div className="acard-title">
                <span>{it.title}</span>
                {it.status && it.status !== 'normal' && <em className="badge">{statusLabel[it.status]}</em>}
              </div>
              {!it.allDay && (
                <div className="acard-sub">
                  {fmtTime(it.start)} – {fmtTime(it.end)}
                  {it.location && ` · ${it.location}`}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {!state.settings.reminders && state.escalas.length > 0 && (
        <button className="card cta" onClick={onSettings}>
          <Icon name="bell" />
          <div>
            <strong>Ativar lembretes</strong>
            <span className="muted small">Receba um aviso antes de cada plantão.</span>
          </div>
        </button>
      )}
    </div>
  );
}
