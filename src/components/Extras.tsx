import { useMemo, useState } from 'react';
import { signOut, useSession } from '../lib/auth';
import { addMonths, fmtShortDate, fmtTime, sameDay, startOfDay } from '../lib/date';
import { getItems, type Item } from '../lib/items';
import { askPermission, notificationsSupported, notify } from '../lib/reminders';
import type { Settings, State } from '../lib/store';
import { saldos, type TrocaEntry } from '../lib/trocas';
import { Row, Sheet, statusLabel } from './common';
import { MoneyInput, Switch } from './Editors';
import { Icon } from './Icon';

/* ---------------- Trocas: saldo por colega ---------------- */

export function Trocas({
  state,
  onClose,
  onNewCover,
  onOpen,
}: {
  state: State;
  onClose: () => void;
  onNewCover: () => void;
  onOpen: (t: TrocaEntry) => void;
}) {
  const list = useMemo(() => saldos(state), [state]);
  const [open, setOpen] = useState<string | null>(null);
  const now = new Date();
  return (
    <Sheet onClose={onClose} closeIcon="back" title="Trocas de plantão">
      <p className="hint pad-x">
        Marque um plantão como “Troquei” para registrar quem cobriu você. Quando você cobrir alguém, registre uma “cobertura”. O saldo mostra quem deve plantão para quem.
      </p>
      {list.length === 0 && <p className="muted pad">Nenhuma troca registrada ainda.</p>}
      {list.map((s) => (
        <div key={s.colega} className="troca-card">
          <button className="list-item" onClick={() => setOpen(open === s.colega ? null : s.colega)}>
            <span className="avatar">{s.colega.slice(0, 1).toUpperCase()}</span>
            <div>
              <div>{s.colega}</div>
              <div className="muted small">
                cobriu você {s.cedi}× · você cobriu {s.cobri}×
              </div>
            </div>
            <span className={`saldo ${s.saldo > 0 ? 'owe' : s.saldo < 0 ? 'owed' : 'even'}`}>
              {s.saldo > 0 ? `Você deve ${s.saldo}` : s.saldo < 0 ? `Te deve ${-s.saldo}` : 'Quites'}
            </span>
          </button>
          {open === s.colega && (
            <div className="troca-entries">
              {s.entries.map((t) => (
                <button key={t.key} className="troca-entry" onClick={() => onOpen(t)}>
                  <Icon name={t.kind === 'cedi' ? 'right' : 'left'} size={18} />
                  <span>
                    {t.kind === 'cedi' ? `${s.colega} cobriu seu plantão` : `Você cobriu ${s.colega}`}
                    <span className="muted small">
                      {' '}
                      · {fmtShortDate(t.start)} {fmtTime(t.start)}
                      {t.start > now && ' (futuro)'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="quick">
        <button className="btn-tonal" onClick={onNewCover}>
          <Icon name="add" size={18} /> Registrar cobertura
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Busca ---------------- */

export function Search({ state, onClose, onItem }: { state: State; onClose: () => void; onItem: (i: Item) => void }) {
  const [q, setQ] = useState('');
  const pool = useMemo(() => {
    const now = new Date();
    const items = getItems({ ...state, hidden: [] }, addMonths(now, -12), addMonths(now, 12));
    const text = (i: Item) => {
      const ev = state.eventos.find((e) => e.id === i.refId);
      const n = state.notas.find((x) => x.id === i.refId);
      return [i.title, i.location, i.note, i.colega, i.turno, ev?.description, n?.text, i.status && statusLabel[i.status]]
        .filter(Boolean)
        .join(' ');
    };
    return items.map((i) => ({ i, t: fold(text(i)) }));
  }, [state]);

  const query = fold(q.trim());
  const today = startOfDay(new Date());
  const results = query
    ? pool
        .filter((x) => query.split(/\s+/).every((w) => x.t.includes(w)))
        .map((x) => x.i)
        // próximos primeiro, depois os passados mais recentes
        .sort((a, b) => {
          const fa = a.start >= today;
          const fb = b.start >= today;
          if (fa !== fb) return fa ? -1 : 1;
          return fa ? a.start.getTime() - b.start.getTime() : b.start.getTime() - a.start.getTime();
        })
        .slice(0, 80)
    : [];

  return (
    <div className="sheet">
      <header className="sheet-bar search-bar">
        <button className="icon-btn" onClick={onClose} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <input autoFocus className="search-input" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Limpar">
            <Icon name="close" />
          </button>
        )}
      </header>
      <div className="sheet-body">
        {!query && <p className="muted pad">Busque por compromissos, anotações, escalas, colegas, locais…</p>}
        {query && results.length === 0 && <p className="muted pad">Nada encontrado.</p>}
        {results.map((i, idx) => {
          const prev = results[idx - 1];
          const head = !prev || !sameDay(prev.start, i.start);
          return (
            <div key={i.key}>
              {head && (
                <div className="search-day">
                  {fmtShortDate(i.start)} {i.start.getFullYear() !== today.getFullYear() && i.start.getFullYear()}
                  {i.start < today && <span className="muted"> · passado</span>}
                </div>
              )}
              <button className="search-row" onClick={() => onItem(i)}>
                <span className="dot" style={{ background: i.color }} />
                <span className="grow">
                  {i.title}
                  {i.status && i.status !== 'normal' && <span className="muted"> · {statusLabel[i.status]}</span>}
                </span>
                <span className="muted small">{i.allDay ? 'dia todo' : fmtTime(i.start)}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fold = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/* ---------------- Configurações ---------------- */

const ANTECEDENCIA: [number, string][] = [
  [15, '15 minutos antes'],
  [30, '30 minutos antes'],
  [60, '1 hora antes'],
  [120, '2 horas antes'],
  [360, '6 horas antes'],
  [720, '12 horas antes'],
  [1440, '1 dia antes'],
];

function PctInput({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="num-field">
      <input type="number" inputMode="decimal" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      <span>{suffix}</span>
    </label>
  );
}

export function SettingsScreen({ state, onClose, onChange }: { state: State; onClose: () => void; onChange: (p: Partial<Settings>) => void }) {
  const s = state.settings;
  const session = useSession();
  const [msg, setMsg] = useState('');
  const supported = notificationsSupported();
  const perm = supported ? Notification.permission : 'denied';

  const toggleReminders = async (v: boolean) => {
    if (!v) return onChange({ reminders: false });
    const ok = await askPermission();
    if (ok) {
      onChange({ reminders: true });
      setMsg('');
    } else setMsg('Permissão de notificação negada. Libere nas configurações do navegador para este site.');
  };

  return (
    <Sheet onClose={onClose} closeIcon="back" title="Configurações">
      <div className="field-label">Lembretes</div>
      <Row icon="bell">
        <div className="between">
          <span>Avisar antes dos plantões</span>
          <Switch checked={s.reminders && perm === 'granted'} onChange={toggleReminders} />
        </div>
      </Row>
      {s.reminders && perm === 'granted' && (
        <>
          <Row icon="clock">
            <select className="plain select" value={s.remindMin} onChange={(e) => onChange({ remindMin: Number(e.target.value) })}>
              {ANTECEDENCIA.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Row>
          <Row icon="event">
            <div className="between">
              <span>Avisar também dos compromissos</span>
              <Switch checked={s.remindEvents} onChange={(v) => onChange({ remindEvents: v })} />
            </div>
          </Row>
          <div className="quick">
            <button className="btn-tonal" onClick={() => notify('Note', 'Os lembretes estão funcionando ✓', 'teste')}>
              <Icon name="bell" size={18} /> Testar notificação
            </button>
          </div>
        </>
      )}
      {!supported && <p className="hint pad-x">Este navegador não suporta notificações.</p>}
      {msg && <p className="hint pad-x warn-text">{msg}</p>}
      <p className="hint pad-x">
        Os avisos chegam enquanto o app estiver aberto ou em segundo plano. Para funcionar melhor, instale o Note na tela inicial (menu do navegador → “Adicionar à tela inicial”).
      </p>
      <hr />
      <div className="field-label">Pagamento</div>
      <Row icon="moon">
        <div className="field-label tight">Adicional noturno (22h às 5h)</div>
        <PctInput value={s.nightPct} onChange={(n) => onChange({ nightPct: n })} suffix="% sobre a hora" />
      </Row>
      <Row icon="flag">
        <div className="field-label tight">Adicional em feriado nacional</div>
        <PctInput value={s.holidayPct} onChange={(n) => onChange({ holidayPct: n })} suffix="% sobre a hora" />
      </Row>
      <Row icon="work">
        <div className="field-label tight">Valor padrão do plantão extra</div>
        <MoneyInput value={s.extraValue} onChange={(n) => onChange({ extraValue: n })} />
      </Row>
      <hr />
      <div className="field-label">Alertas</div>
      <Row icon="warning">
        <div className="field-label tight">Descanso mínimo entre plantões</div>
        <PctInput value={s.minRest} onChange={(n) => onChange({ minRest: n })} suffix="horas (0 = não avisar)" />
      </Row>
      <hr />
      <div className="field-label">Conta</div>
      {session?.user.email && <p className="hint pad-x">Conectado como {session.user.email}</p>}
      <button className="danger-btn" onClick={() => signOut()}>
        Sair da conta
      </button>
    </Sheet>
  );
}

