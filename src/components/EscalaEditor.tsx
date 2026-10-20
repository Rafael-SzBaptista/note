import { useMemo, useState } from 'react';
import { addDays, dateKey, fmtShortDate, fmtTime } from '../lib/date';
import { findConflicts } from '../lib/conflicts';
import { escalaOccurrences, regraAnchor, sortedVersions, versionAt } from '../lib/items';
import { brl, earnings } from '../lib/money';
import type { Escala, PayType, Regra, State, Turno } from '../lib/store';
import { DEFAULT_TURNOS } from '../lib/store';
import { Row, Sheet } from './common';
import { ColorPicker, MoneyInput, SaveBtn, Switch } from './Editors';
import { Icon } from './Icon';

const PRESETS: { label: string; p: Partial<Regra> }[] = [
  { label: '12x36', p: { mode: 'horas', onHours: 12, offHours: 36 } },
  { label: '24x48', p: { mode: 'horas', onHours: 24, offHours: 48 } },
  { label: '24x72', p: { mode: 'horas', onHours: 24, offHours: 72 } },
  { label: '12x60', p: { mode: 'horas', onHours: 12, offHours: 60 } },
  { label: '6x1', p: { mode: 'dias', onDays: 6, offDays: 1, shiftHours: 8 } },
  { label: '5x2', p: { mode: 'dias', onDays: 5, offDays: 2, shiftHours: 8 } },
  { label: '4x2', p: { mode: 'dias', onDays: 4, offDays: 2, shiftHours: 12 } },
  { label: '2D 2N 4F', p: { mode: 'ciclo', ciclo: ['D', 'D', 'N', 'N', 'F', 'F', 'F', 'F'] } },
  { label: 'Dia/Noite 12x36', p: { mode: 'ciclo', ciclo: ['D', 'F', 'N', 'F', 'F'] } },
];

const sameArr = (a?: string[], b?: string[]) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

const presetOf = (r: Regra) =>
  PRESETS.find(({ p }) =>
    p.mode === 'horas'
      ? r.mode === 'horas' && r.onHours === p.onHours && r.offHours === p.offHours
      : p.mode === 'dias'
        ? r.mode === 'dias' && r.onDays === p.onDays && r.offDays === p.offDays
        : r.mode === 'ciclo' && sameArr(r.ciclo, p.ciclo),
  )?.label;

export function describeRegra(r: Regra) {
  if (r.mode === 'horas') return `${r.onHours}x${r.offHours} · ${r.startTime}`;
  if (r.mode === 'dias') return `${r.onDays}x${r.offDays} · ${r.startTime} (${r.shiftHours}h)`;
  return `Ciclo ${r.ciclo.join(' ')}`;
}

const fmtD = (key: string) => {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
};

function Num({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="num-field">
      <input type="number" inputMode="decimal" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      <span>{suffix}</span>
    </label>
  );
}

const NEXT_IDS = ['D', 'N', 'M', 'T', 'X', 'Y'];

/** Nova escala no lugar de outra: apagar a antiga inteira ou mantê-la até a véspera. */
export interface Replace {
  id: string;
  mode: 'tudo' | 'antes';
}

/** Dia anterior ao primeiro plantão da escala (fim da escala substituída no modo "antes"). */
export const dayBefore = (e: Escala) => dateKey(addDays(regraAnchor(sortedVersions(e)[0]), -1));

function CicloEditor({ r, set }: { r: Regra; set: (p: Partial<Regra>) => void }) {
  const ids = [...r.turnos.map((t) => t.id), 'F'];
  const setTurno = (i: number, p: Partial<Turno>) => set({ turnos: r.turnos.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const addTurno = () => {
    const id = NEXT_IDS.find((x) => !r.turnos.some((t) => t.id === x));
    if (id) set({ turnos: [...r.turnos, { id, label: id === 'M' ? 'Manhã' : id === 'T' ? 'Tarde' : 'Turno', start: '08:00', hours: 6 }] });
  };
  const removeTurno = (id: string) =>
    set({ turnos: r.turnos.filter((t) => t.id !== id), ciclo: r.ciclo.map((c) => (c === id ? 'F' : c)) });
  const color = (id: string) => (id === 'F' ? 'var(--surface-3)' : `hsl(${(ids.indexOf(id) * 67 + 200) % 360} 70% 45%)`);

  return (
    <div className="ciclo">
      <div className="field-label">Turnos</div>
      {r.turnos.map((t, i) => (
        <div key={t.id} className="turno-row">
          <span className="turno-id" style={{ background: color(t.id) }}>
            {t.id}
          </span>
          <input className="turno-label" value={t.label} onChange={(e) => setTurno(i, { label: e.target.value })} />
          <input type="time" value={t.start} onChange={(e) => e.target.value && setTurno(i, { start: e.target.value })} />
          <label className="turno-h">
            <input type="number" inputMode="decimal" min={1} value={t.hours} onChange={(e) => setTurno(i, { hours: Math.max(0, Number(e.target.value) || 0) })} />h
          </label>
          {r.turnos.length > 1 && (
            <button className="icon-btn sm" onClick={() => removeTurno(t.id)} aria-label={`Remover turno ${t.label}`}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      ))}
      {r.turnos.length < NEXT_IDS.length && (
        <button className="text-btn add-turno" onClick={addTurno}>
          + Turno
        </button>
      )}
      <div className="field-label">Sequência do ciclo · toque para trocar</div>
      <div className="ciclo-days">
        {r.ciclo.map((c, i) => (
          <button
            key={i}
            className={`ciclo-day${c === 'F' ? ' off' : ''}`}
            style={{ background: color(c) }}
            onClick={() => {
              const next = ids[(ids.indexOf(c) + 1) % ids.length];
              set({ ciclo: r.ciclo.map((x, j) => (j === i ? next : x)) });
            }}
          >
            <small>{i + 1}</small>
            {c}
          </button>
        ))}
        <div className="ciclo-btns">
          <button className="pill" onClick={() => r.ciclo.length > 1 && set({ ciclo: r.ciclo.slice(0, -1) })}>
            − dia
          </button>
          <button className="pill" onClick={() => r.ciclo.length < 28 && set({ ciclo: [...r.ciclo, 'F'] })}>
            + dia
          </button>
        </div>
      </div>
      <p className="hint">F = folga. O ciclo se repete a partir do “primeiro dia do ciclo”.</p>
    </div>
  );
}

export function EscalaEditor({
  state,
  initial,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  state: State;
  initial: Escala;
  isNew: boolean;
  onSave: (e: Escala, replace?: Replace) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const now = useMemo(() => new Date(), []);
  const sorted = useMemo(() => sortedVersions(initial), [initial]);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [versions, setVersions] = useState(sorted);
  const [editIdx, setEditIdx] = useState(() => versionAt(initial, now));
  const [rule, setRule] = useState<Regra>(sorted[editIdx] ?? sorted[0]);
  /** criando uma nova regra a partir de uma data (mantém o histórico) */
  const [draftNew, setDraftNew] = useState(false);
  const set = (p: Partial<Regra>) => setRule((r) => ({ ...r, ...p }));

  const build = (): Escala => {
    let vs: Regra[];
    if (draftNew) vs = [...versions.filter((v) => regraAnchor(v) < regraAnchor(rule)), rule];
    else vs = versions.map((v, i) => (i === editIdx ? rule : v));
    if (!vs.length) vs = [rule];
    return { ...initial, name: name.trim() || 'Plantão', color, endDate, versions: vs };
  };

  const startNewVersion = () => {
    // a nova regra começa, por padrão, no próximo plantão da regra atual
    const next = escalaOccurrences(initial, now, addDays(now, 60))[0];
    const base = versions[versions.length - 1];
    setRule({ ...base, startDate: dateKey(next?.start ?? now), startTime: next ? fmtTime(next.start) : base.startTime });
    setDraftNew(true);
  };

  const [replace, setReplace] = useState<Replace | null>(null);
  const [askReplace, setAskReplace] = useState<string | null>(null);

  const draft = build();
  const preview = useMemo(() => escalaOccurrences(draft, now, addDays(now, 60)).slice(0, 6), [JSON.stringify(draft)]);
  /** estado como ficaria depois de salvar (considerando a substituição escolhida) */
  const conflictsWith = (rep: Replace | null) => {
    let others = state.escalas.filter((e) => e.id !== draft.id);
    if (rep?.mode === 'tudo') others = others.filter((e) => e.id !== rep.id);
    if (rep?.mode === 'antes') others = others.map((e) => (e.id === rep.id ? { ...e, endDate: dayBefore(draft) } : e));
    return findConflicts({ ...state, escalas: [...others, draft] }, now, addDays(now, 60)).filter(
      (c) => c.a.refId === draft.id || c.b.refId === draft.id,
    );
  };
  const conflicts = useMemo(() => conflictsWith(replace), [JSON.stringify(draft), state, replace]);
  /** escala existente com a qual a nova se sobrepõe (provável escala errada) */
  const overlapped = useMemo(() => {
    if (!isNew) return null;
    const c = conflictsWith(null).find((x) => x.kind === 'overlap');
    const other = c ? (c.a.refId === draft.id ? c.b : c.a) : null;
    return other?.type === 'shift' ? state.escalas.find((e) => e.id === other.refId) ?? null : null;
  }, [JSON.stringify(draft), state, isNew]);

  const save = () => {
    if (isNew && !replace && overlapped) return setAskReplace(overlapped.id);
    onSave(build(), replace ?? undefined);
  };

  const preset = presetOf(rule);
  const s = state.settings;

  return (
    <Sheet onClose={onClose} title={isNew ? 'Nova escala' : 'Editar escala'} action={<SaveBtn onClick={save} />}>
      <input className="title-input" placeholder="Nome (ex.: Hospital São Lucas)" value={name} onChange={(x) => setName(x.target.value)} />

      {!isNew && (
        <div className="versions">
          {versions.length > 1 || draftNew ? (
            <>
              <div className="field-label">Histórico da escala</div>
              {versions.map((v, i) => (
                <div key={i} className={`version${!draftNew && i === editIdx ? ' on' : ''}`}>
                  <button
                    disabled={draftNew}
                    onClick={() => {
                      // guarda o que foi editado na regra atual antes de trocar
                      const vs = build().versions;
                      setVersions(vs);
                      setEditIdx(i);
                      setRule(vs[i]);
                    }}
                  >
                    <strong>{describeRegra(v)}</strong>
                    <span>desde {fmtD(v.startDate)}</span>
                  </button>
                  {i > 0 && (
                    <button
                      className="icon-btn sm"
                      aria-label="Remover esta mudança"
                      onClick={() => {
                        const vs = versions.filter((_, j) => j !== i);
                        setVersions(vs);
                        setDraftNew(false);
                        setEditIdx(vs.length - 1);
                        setRule(vs[vs.length - 1]);
                      }}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>
              ))}
              {draftNew && (
                <div className="version on new">
                  <button>
                    <strong>{describeRegra(rule)}</strong>
                    <span>nova · a partir de {fmtD(rule.startDate)}</span>
                  </button>
                  <button
                    className="icon-btn sm"
                    aria-label="Cancelar mudança"
                    onClick={() => {
                      setDraftNew(false);
                      setRule(versions[editIdx]);
                    }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              )}
            </>
          ) : null}
          {!draftNew && (
            <button className="btn-tonal change-btn" onClick={startNewVersion}>
              <Icon name="swap" size={18} /> Mudar a escala a partir de uma data
            </button>
          )}
          <p className="hint">
            {draftNew
              ? 'Os plantões antes da data abaixo continuam como estavam (horas e valores do histórico não mudam).'
              : 'Editar aqui corrige a regra selecionada, inclusive os plantões passados dela.'}
          </p>
        </div>
      )}

      <div className="field-label">Escala</div>
      <div className="presets">
        {PRESETS.map(({ label, p }) => (
          <button
            key={label}
            className={`pill${preset === label ? ' on' : ''}`}
            onClick={() => set(p.mode === 'ciclo' ? { ...p, turnos: rule.turnos.length ? rule.turnos : DEFAULT_TURNOS } : p)}
          >
            {label}
          </button>
        ))}
        {!preset && <span className="pill on">Personalizada</span>}
      </div>
      <div className="seg three">
        <button className={rule.mode === 'horas' ? 'on' : ''} onClick={() => set({ mode: 'horas' })}>
          Por horas
        </button>
        <button className={rule.mode === 'dias' ? 'on' : ''} onClick={() => set({ mode: 'dias' })}>
          Por dias
        </button>
        <button className={rule.mode === 'ciclo' ? 'on' : ''} onClick={() => set({ mode: 'ciclo' })}>
          Ciclo
        </button>
      </div>
      {rule.mode === 'horas' && (
        <div className="xrow">
          <Num value={rule.onHours} onChange={(n) => set({ onHours: n })} suffix="h trabalho" />
          <span className="x">×</span>
          <Num value={rule.offHours} onChange={(n) => set({ offHours: n })} suffix="h descanso" />
        </div>
      )}
      {rule.mode === 'dias' && (
        <>
          <div className="xrow">
            <Num value={rule.onDays} onChange={(n) => set({ onDays: n })} suffix="dias trabalho" />
            <span className="x">×</span>
            <Num value={rule.offDays} onChange={(n) => set({ offDays: n })} suffix="dias folga" />
          </div>
          <div className="xrow">
            <Num value={rule.shiftHours} onChange={(n) => set({ shiftHours: n })} suffix="horas por turno" />
          </div>
        </>
      )}
      {rule.mode === 'ciclo' && <CicloEditor r={rule} set={set} />}
      <hr />
      <Row icon="event">
        <div className="field-label tight">
          {draftNew ? 'Nova regra vale a partir de' : rule.mode === 'ciclo' ? 'Primeiro dia do ciclo (dia 1)' : 'Primeiro plantão'}
        </div>
        <div className="dt">
          <input type="date" value={rule.startDate} onChange={(x) => x.target.value && set({ startDate: x.target.value })} />
          {rule.mode !== 'ciclo' && <input type="time" value={rule.startTime} onChange={(x) => x.target.value && set({ startTime: x.target.value })} />}
        </div>
      </Row>
      <Row icon="clock">
        <div className="field-label tight">Escala termina em (opcional)</div>
        <div className="dt">
          <input type="date" value={endDate} onChange={(x) => setEndDate(x.target.value)} />
          {endDate && (
            <button className="text-btn" onClick={() => setEndDate('')}>
              Limpar
            </button>
          )}
        </div>
      </Row>
      <hr />

      <div className="field-label">Pagamento</div>
      <div className="seg three">
        {(
          [
            ['plantao', 'Por plantão'],
            ['hora', 'Por hora'],
            ['fixo', 'Salário fixo'],
          ] as [PayType, string][]
        ).map(([v, l]) => (
          <button key={v} className={rule.payType === v ? 'on' : ''} onClick={() => set({ payType: v })}>
            {l}
          </button>
        ))}
      </div>
      {rule.payType === 'fixo' ? (
        <p className="hint pad-x">Plantões contam horas, mas sem valor por plantão. Use “plantão extra” para o que for pago à parte.</p>
      ) : (
        <>
          <div className="xrow">
            <MoneyInput value={rule.payValue} onChange={(n) => set({ payValue: n })} suffix={rule.payType === 'hora' ? 'por hora' : 'por plantão'} />
          </div>
          <Row icon="sun">
            <div className="between">
              <span>Adicional noturno (+{s.nightPct}% das 22h às 5h)</span>
              <Switch checked={rule.night} onChange={(v) => set({ night: v })} />
            </div>
          </Row>
          <Row icon="event">
            <div className="between">
              <span>Feriados nacionais (+{s.holidayPct}%)</span>
              <Switch checked={rule.holiday} onChange={(v) => set({ holiday: v })} />
            </div>
          </Row>
          <p className="hint pad-x">Os percentuais podem ser ajustados em Configurações.</p>
        </>
      )}
      <hr />
      <Row icon="palette">
        <ColorPicker value={color} onChange={setColor} />
      </Row>
      <hr />

      {isNew && state.escalas.length > 0 && (
        <div className="replace-box">
          <div className="field-label">Esta escala substitui outra?</div>
          {overlapped && !replace && (
            <p className="hint warn-text">
              Ela se sobrepõe à escala “{overlapped.name}”. Se a antiga foi cadastrada errada, escolha substituí-la.
            </p>
          )}
          <select
            className="plain select boxed"
            value={replace?.id ?? ''}
            onChange={(e) => setReplace(e.target.value ? { id: e.target.value, mode: replace?.mode ?? 'tudo' } : null)}
          >
            <option value="">Não, é uma escala a mais (outro emprego)</option>
            {state.escalas.map((e) => (
              <option key={e.id} value={e.id}>
                Substituir “{e.name}”
              </option>
            ))}
          </select>
          {replace && (
            <>
              <div className="seg">
                <button className={replace.mode === 'tudo' ? 'on' : ''} onClick={() => setReplace({ ...replace, mode: 'tudo' })}>
                  Apagar a antiga inteira
                </button>
                <button className={replace.mode === 'antes' ? 'on' : ''} onClick={() => setReplace({ ...replace, mode: 'antes' })}>
                  Manter até a véspera
                </button>
              </div>
              <p className="hint">
                {replace.mode === 'tudo'
                  ? 'A escala antiga e todos os plantões dela somem. Trocas, pagamentos e observações passam para a nova nos plantões que caem no mesmo horário.'
                  : `A escala antiga termina em ${fmtD(dayBefore(draft))}, véspera do primeiro plantão desta. O histórico antes disso fica como está.`}
              </p>
            </>
          )}
        </div>
      )}

      <div className="field-label">Próximos plantões</div>
      <div className="preview">
        {preview.length === 0 && <div className="muted">Nenhum plantão nos próximos 60 dias.</div>}
        {preview.map((o) => {
          const earn = earnings(
            { key: '', type: 'shift', title: '', start: o.start, end: o.end, allDay: false, color, refId: '', status: 'normal', rule: o.rule },
            s,
          );
          return (
            <div key={o.start.getTime()}>
              <span className="dot" style={{ background: color }} />
              <span className="grow">
                {fmtShortDate(o.start)} · {fmtTime(o.start)} – {fmtTime(o.end)}
                {o.turno && <span className="muted"> · {o.turno}</span>}
              </span>
              {earn.total > 0 && <span className="muted">{brl(earn.total)}</span>}
            </div>
          );
        })}
      </div>
      {conflicts.length > 0 && (
        <div className="conflict">
          <Icon name="warning" size={18} />
          <div>
            <strong>
              {conflicts.length} alerta{conflicts.length > 1 ? 's' : ''} com outros plantões nos próximos 60 dias
            </strong>
            {conflicts.slice(0, 3).map((c, i) => (
              <div key={i}>
                {fmtShortDate(c.b.start)}: {c.a.title} e {c.b.title} —{' '}
                {c.kind === 'overlap' ? 'horários se sobrepõem' : `só ${Math.round(c.gap * 10) / 10}h de descanso`}
              </div>
            ))}
          </div>
        </div>
      )}
      {askReplace && (
        <div className="dialog-wrap" onClick={() => setAskReplace(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p>
              A nova escala se sobrepõe à “{state.escalas.find((e) => e.id === askReplace)?.name}”. Quer substituir a antiga?
            </p>
            <div className="dialog-actions stack">
              <button className="text-btn" onClick={() => onSave(build(), { id: askReplace, mode: 'tudo' })}>
                Substituir (apagar a antiga)
              </button>
              <button className="text-btn" onClick={() => onSave(build(), { id: askReplace, mode: 'antes' })}>
                Substituir a partir desta data
              </button>
              <button className="text-btn" onClick={() => onSave(build())}>
                Manter as duas
              </button>
              <button className="text-btn" onClick={() => setAskReplace(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {!isNew && (
        <button className="danger-btn" onClick={onDelete}>
          <Icon name="delete" size={20} /> Excluir escala
        </button>
      )}
    </Sheet>
  );
}

