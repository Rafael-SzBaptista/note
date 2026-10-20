import { useMemo, useState } from 'react';
import { addDays, dateKey, fmtShortDate, fmtTime, parseDate, parseDT } from '../lib/date';
import { findConflicts } from '../lib/conflicts';
import { getItems, type Item } from '../lib/items';
import { COLORS, type EventKind, type Evento, type Nota, type Repeat, type State } from '../lib/store';
import { colegas } from '../lib/trocas';
import { Row, Sheet } from './common';
import { Icon } from './Icon';

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="colors">
      {COLORS.map((c) => (
        <button
          key={c.hex}
          className="swatch"
          style={{ background: c.hex }}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChange(c.hex)}
        >
          {value === c.hex && <Icon name="check" size={16} />}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export const SaveBtn = ({ onClick }: { onClick: () => void }) => (
  <button className="btn-filled" onClick={onClick}>
    Salvar
  </button>
);

export const DeleteBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <>
    <hr />
    <button className="danger-btn" onClick={onClick}>
      <Icon name="delete" size={20} /> {label}
    </button>
  </>
);

export function MoneyInput({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="num-field money">
      <span className="cur">R$</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value || ''}
        placeholder="0,00"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

export function ColegaInput({ state, value, onChange }: { state: State; value: string; onChange: (v: string) => void }) {
  const list = colegas(state);
  return (
    <>
      <input className="plain" list="colegas" placeholder="Nome do colega" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="colegas">
        {list.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

const REPEATS: [Repeat, string][] = [
  ['none', 'Não se repete'],
  ['daily', 'Todo dia'],
  ['weekly', 'Toda semana'],
  ['monthly', 'Todo mês'],
  ['yearly', 'Todo ano'],
];

const KINDS: [EventKind, string][] = [
  ['compromisso', 'Compromisso'],
  ['extra', 'Plantão extra'],
  ['cobertura', 'Cobertura'],
];

/* ---------------- Compromisso / plantão extra / cobertura ---------------- */

export function EventEditor({
  state,
  initial,
  onSave,
  onClose,
  onDelete,
}: {
  state: State;
  initial: Evento;
  onSave: (e: Evento) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [ev, setEv] = useState(initial);
  const set = (p: Partial<Evento>) => setEv((e) => ({ ...e, ...p }));
  const [sd, st = '09:00'] = ev.start.split('T');
  const [ed, et = '10:00'] = ev.end.split('T');
  const work = ev.kind !== 'compromisso';

  const setStart = (date: string, time: string) => {
    // mantém a duração ao mover o início
    const dur = parseDT(ev.end).getTime() - parseDT(ev.start).getTime();
    const ns = parseDT(`${date}T${time}`);
    const ne = new Date(ns.getTime() + Math.max(dur, 0));
    set({ start: `${date}T${time}`, end: `${dateKey(ne)}T${fmtTime(ne)}` });
  };

  const range = () => {
    const s = ev.allDay ? parseDate(sd) : parseDT(ev.start);
    const e = ev.allDay ? addDays(parseDate(ed), 1) : parseDT(ev.end);
    return [s, e] as const;
  };

  // avisos: plantões trabalhados checam choque e descanso mínimo; compromissos só sobreposição
  const warnings = useMemo(() => {
    const [s, e] = range();
    if (e <= s) return [];
    const others = { ...state, eventos: state.eventos.filter((x) => x.id !== ev.id) };
    if (work && !ev.allDay) {
      const me: Item = { key: '__me', type: ev.kind === 'extra' ? 'extra' : 'cover', title: ev.title || 'Este plantão', start: s, end: e, allDay: false, color: ev.color, refId: ev.id };
      return findConflicts(others, addDays(s, -1), addDays(e, 1), [me])
        .filter((c) => c.a.key === '__me' || c.b.key === '__me')
        .map((c) => {
          const o = c.a.key === '__me' ? c.b : c.a;
          return `${o.title} (${fmtShortDate(o.start)} ${fmtTime(o.start)}–${fmtTime(o.end)}) — ${
            c.kind === 'overlap' ? 'horários se sobrepõem' : `só ${Math.round(c.gap * 10) / 10}h de descanso`
          }`;
        });
    }
    return getItems({ ...others, hidden: [] }, s, e)
      .filter((i) => i.type !== 'note' && i.type !== 'holiday' && i.status !== 'folga' && i.status !== 'troca')
      .map((c) => `${c.title} · ${c.allDay ? 'dia inteiro' : `${fmtShortDate(c.start)} ${fmtTime(c.start)}–${fmtTime(c.end)}`}`);
  }, [state, ev.start, ev.end, ev.allDay, ev.id, ev.kind]);

  // meus plantões que o colega pode cobrir em troca (dos últimos 30 dias aos próximos 120)
  const myShifts = useMemo(() => {
    const now = new Date();
    return getItems({ ...state, hidden: [] }, addDays(now, -30), addDays(now, 120)).filter(
      (i) => i.type === 'shift' && (i.status === 'normal' || i.occKey === ev.trocaKey),
    );
  }, [state, ev.trocaKey]);

  const save = () => {
    let out = { ...ev, title: ev.title.trim(), colega: ev.colega?.trim() };
    if (out.kind !== 'cobertura') out = { ...out, trocaKey: undefined };
    if (parseDT(out.end) < parseDT(out.start)) out = { ...out, end: out.start };
    if (out.kind !== 'compromisso') out = { ...out, repeat: 'none' };
    onSave(out);
  };

  const placeholder = ev.kind === 'extra' ? 'Plantão extra' : ev.kind === 'cobertura' ? `Cobrindo ${ev.colega || 'colega'}` : 'Adicionar título';

  return (
    <Sheet onClose={onClose} action={<SaveBtn onClick={save} />}>
      <input
        className="title-input"
        placeholder={placeholder}
        value={ev.title}
        autoFocus={!initial.title && ev.kind === 'compromisso'}
        onChange={(e) => set({ title: e.target.value })}
      />
      <div className="seg three">
        {KINDS.map(([k, l]) => (
          <button
            key={k}
            className={ev.kind === k ? 'on' : ''}
            onClick={() =>
              set({
                kind: k,
                value: k === 'extra' && !ev.value ? state.settings.extraValue : ev.value,
                allDay: k === 'compromisso' ? ev.allDay : false,
              })
            }
          >
            {l}
          </button>
        ))}
      </div>

      {ev.kind === 'cobertura' && (
        <>
          <p className="hint pad-x">Plantão de um colega que você vai trabalhar. Conta horas, mas não gera pagamento extra.</p>
          <Row icon="people">
            <ColegaInput state={state} value={ev.colega ?? ''} onChange={(v) => set({ colega: v })} />
          </Row>
          <Row icon="swap">
            <div className="field-label tight">Em troca, {ev.colega?.trim() || 'o colega'} cobre meu plantão de:</div>
            <select className="plain select boxed" value={ev.trocaKey ?? ''} onChange={(e) => set({ trocaKey: e.target.value || undefined })}>
              <option value="">Ainda não combinado</option>
              {myShifts.map((i) => (
                <option key={i.occKey} value={i.occKey}>
                  {fmtShortDate(i.start)} · {fmtTime(i.start)}–{fmtTime(i.end)} · {i.title}
                  {i.turno ? ` (${i.turno})` : ''}
                </option>
              ))}
            </select>
            {ev.trocaKey && <div className="muted small">Esse plantão será marcado como “Troquei”.</div>}
          </Row>
          {state.escalas.length > 0 && (
            <Row icon="repeat">
              <select
                className="plain select"
                value={ev.escalaId ?? ''}
                onChange={(e) => {
                  const esc = state.escalas.find((x) => x.id === e.target.value);
                  set({ escalaId: e.target.value, color: esc?.color ?? ev.color });
                }}
              >
                <option value="">Local / emprego (opcional)</option>
                {state.escalas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Row>
          )}
          <hr />
        </>
      )}

      {ev.kind === 'compromisso' && (
        <Row icon="clock">
          <div className="between">
            <span>Dia inteiro</span>
            <Switch checked={ev.allDay} onChange={(v) => set({ allDay: v })} />
          </div>
        </Row>
      )}
      <Row icon={ev.kind === 'compromisso' ? undefined : 'clock'}>
        <div className="dt">
          <input type="date" value={sd} onChange={(e) => e.target.value && setStart(e.target.value, st)} />
          {!ev.allDay && <input type="time" value={st} onChange={(e) => e.target.value && setStart(sd, e.target.value)} />}
        </div>
      </Row>
      <Row>
        <div className="dt">
          <input type="date" value={ed} onChange={(e) => e.target.value && set({ end: `${e.target.value}T${et}` })} />
          {!ev.allDay && <input type="time" value={et} onChange={(e) => e.target.value && set({ end: `${ed}T${e.target.value}` })} />}
        </div>
      </Row>
      {ev.kind === 'compromisso' && (
        <Row icon="repeat">
          <select className="plain select" value={ev.repeat ?? 'none'} onChange={(e) => set({ repeat: e.target.value as Repeat })}>
            {REPEATS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {(ev.repeat ?? 'none') !== 'none' && (
            <div className="dt until">
              <span className="muted">até</span>
              <input type="date" value={ev.repeatUntil ?? ''} onChange={(e) => set({ repeatUntil: e.target.value })} />
              {!ev.repeatUntil && <span className="muted small">(sem fim)</span>}
            </div>
          )}
        </Row>
      )}

      {warnings.length > 0 && (
        <div className="conflict">
          <Icon name="warning" size={18} />
          <div>
            <strong>{work ? 'Atenção com seus plantões:' : 'Neste horário você também tem:'}</strong>
            {warnings.slice(0, 4).map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {ev.kind === 'extra' && (
        <>
          <hr />
          <div className="field-label">Pagamento</div>
          <div className="xrow">
            <MoneyInput value={ev.value ?? 0} onChange={(n) => set({ value: n })} suffix="pelo plantão" />
          </div>
          <Row icon="check">
            <div className="between">
              <span>Já recebi</span>
              <Switch checked={!!ev.paid} onChange={(v) => set({ paid: v })} />
            </div>
          </Row>
        </>
      )}
      <hr />
      <Row icon="place">
        <input className="plain" placeholder="Adicionar local" value={ev.location} onChange={(e) => set({ location: e.target.value })} />
      </Row>
      <hr />
      <Row icon="palette">
        <ColorPicker value={ev.color} onChange={(c) => set({ color: c })} />
      </Row>
      <hr />
      <Row icon="notes">
        <textarea className="plain" rows={3} placeholder="Adicionar descrição" value={ev.description} onChange={(e) => set({ description: e.target.value })} />
      </Row>
      {onDelete && (
        <DeleteBtn
          onClick={onDelete}
          label={ev.kind === 'compromisso' ? 'Excluir compromisso' : ev.kind === 'extra' ? 'Excluir plantão extra' : 'Excluir cobertura'}
        />
      )}
    </Sheet>
  );
}

/* ---------------- Anotação ---------------- */

export function NoteEditor({
  initial,
  onSave,
  onClose,
  onDelete,
}: {
  initial: Nota;
  onSave: (n: Nota) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [n, setN] = useState(initial);
  return (
    <Sheet onClose={onClose} action={<SaveBtn onClick={() => onSave({ ...n, text: n.text.trim() })} />}>
      <textarea
        className="title-input note-input"
        placeholder="Escreva sua anotação…"
        rows={5}
        autoFocus
        value={n.text}
        onChange={(e) => setN({ ...n, text: e.target.value })}
      />
      <hr />
      <Row icon="event">
        <input type="date" className="plain" value={n.date} onChange={(e) => e.target.value && setN({ ...n, date: e.target.value })} />
      </Row>
      <hr />
      <Row icon="palette">
        <ColorPicker value={n.color} onChange={(c) => setN({ ...n, color: c })} />
      </Row>
      {onDelete && <DeleteBtn onClick={onDelete} label="Excluir anotação" />}
    </Sheet>
  );
}
