import { useMemo } from 'react';
import { addDays, dateKey, fmtHours, fmtRange, fmtShortDate, fmtTime, parseDT, startOfDay } from '../lib/date';
import { conflictsOf, findConflicts } from '../lib/conflicts';
import { holidayOn } from '../lib/holidays';
import { getItems, itemHours, itemsOnDay, type Item } from '../lib/items';
import { brl, earnings } from '../lib/money';
import type { Evento, ShiftOverride, ShiftStatus, State } from '../lib/store';
import { Chip, Row, Sheet } from './common';
import { ColegaInput, Switch } from './Editors';
import { Icon } from './Icon';

const REPEAT_LABEL = { none: '', daily: 'Repete todo dia', weekly: 'Repete toda semana', monthly: 'Repete todo mês', yearly: 'Repete todo ano' };

export function Detail({
  state,
  item,
  onClose,
  onEdit,
  onDelete,
  onOverride,
  onPatchEvent,
  onAddEvent,
  onAddNote,
  onAddCover,
  onItem,
}: {
  state: State;
  item: Item;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOverride: (o: ShiftOverride) => void;
  onPatchEvent: (id: string, p: Partial<Evento>) => void;
  onAddEvent: (d: Date) => void;
  onAddNote: (d: Date) => void;
  onAddCover: (item: Item) => void;
  onItem: (i: Item) => void;
}) {
  const ev = state.eventos.find((e) => e.id === item.refId);
  const note = state.notas.find((n) => n.id === item.refId);
  const escala = state.escalas.find((e) => e.id === item.refId);
  const ov: ShiftOverride = (item.occKey && state.overrides[item.occKey]) || { status: 'normal', note: '' };
  const changeOv = (p: Partial<ShiftOverride>) => onOverride({ ...ov, ...p });

  // dados "ao vivo" (o item pode estar desatualizado depois de uma edição)
  const live: Item = {
    ...item,
    status: item.type === 'shift' ? ov.status : item.status,
    paid: item.type === 'shift' ? !!ov.paid : !!ev?.paid,
    value: ev?.value ?? item.value,
  };
  const earn = earnings(live, state.settings);

  const day = startOfDay(item.start);
  const others = useMemo(
    () => itemsOnDay(getItems(state, day, addDays(day, 1)), day).filter((i) => i.key !== item.key),
    [state, item.key],
  );
  const conflicts = useMemo(
    () => conflictsOf(findConflicts(state, addDays(item.start, -1), addDays(item.end, 2)), item.key),
    [state, item.key],
  );
  const covers = item.occKey ? state.eventos.filter((e) => e.kind === 'cobertura' && e.trocaKey === item.occKey) : [];
  const coveredShift = ev?.trocaKey ? ev.trocaKey : null;
  const holiday = holidayOn(dateKey(day));

  const kindLabel = {
    shift: escala ? `Escala ${escala.name}` : 'Plantão',
    extra: 'Plantão extra',
    cover: `Cobertura de troca${item.colega ? ` · plantão de ${item.colega}` : ''}`,
    event: 'Compromisso',
    note: 'Anotação',
    holiday: 'Feriado nacional',
  }[item.type];
  const isHoliday = item.type === 'holiday';

  return (
    <Sheet
      onClose={onClose}
      action={
        !isHoliday && (
          <>
            <button className="icon-btn" onClick={onEdit} aria-label={item.type === 'shift' ? 'Editar escala' : 'Editar'}>
              <Icon name="edit" />
            </button>
            <button className="icon-btn" onClick={onDelete} aria-label="Excluir">
              <Icon name="delete" />
            </button>
          </>
        )
      }
    >
      <div className="detail-head">
        <span className="square" style={{ background: item.color }} />
        <div>
          <h1 className={live.status === 'folga' || live.status === 'troca' ? 'strike' : ''}>
            {item.type === 'note' ? 'Anotação' : item.title}
            {item.turno && <span className="muted"> · {item.turno}</span>}
          </h1>
          <div className="muted">{fmtRange(item.start, item.end, item.allDay)}</div>
          {!item.allDay && <div className="muted">Duração: {fmtHours(itemHours(item))}</div>}
          {ev?.repeat && ev.repeat !== 'none' && <div className="muted">{REPEAT_LABEL[ev.repeat]}</div>}
        </div>
      </div>

      {note && <p className="note-text">{note.text}</p>}
      {ev?.location && <Row icon="place">{ev.location}</Row>}
      {ev?.description && (
        <Row icon="notes">
          <span className="pre">{ev.description}</span>
        </Row>
      )}
      <Row icon={item.type === 'note' ? 'notes' : item.type === 'shift' ? 'repeat' : item.type === 'extra' ? 'work' : item.type === 'cover' ? 'swap' : isHoliday ? 'flag' : 'event'}>
        <span className="muted">{kindLabel}</span>
      </Row>
      {holiday && !isHoliday && (
        <Row icon="flag">
          <span className="muted">{holiday.name}{holiday.facultativo ? ' (ponto facultativo)' : ''}</span>
        </Row>
      )}

      {conflicts.length > 0 && (
        <div className="conflict">
          <Icon name="warning" size={18} />
          <div>
            {conflicts.map((c, i) => {
              const o = c.a.key === item.key ? c.b : c.a;
              return (
                <div key={i}>
                  {c.kind === 'overlap' ? (
                    <>
                      <strong>Choque de horário</strong> com {o.title} ({fmtShortDate(o.start)} {fmtTime(o.start)}–{fmtTime(o.end)})
                    </>
                  ) : (
                    <>
                      <strong>Descanso curto:</strong> só {Math.round(c.gap * 10) / 10}h entre este plantão e {o.title} (mínimo {state.settings.minRest}h)
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {item.type === 'shift' && (
        <>
          <hr />
          <div className="field-label">Este plantão</div>
          <div className="seg three">
            {(['normal', 'troca', 'folga'] as ShiftStatus[]).map((s) => (
              <button key={s} className={ov.status === s ? 'on' : ''} onClick={() => changeOv({ status: s })}>
                {s === 'normal' ? 'Vou trabalhar' : s === 'troca' ? 'Troquei' : 'Folga/falta'}
              </button>
            ))}
          </div>
          {ov.status === 'troca' && (
            <div className="troca-box">
              <Row icon="swap">
                <div className="field-label tight">Quem vai cobrir este plantão?</div>
                <ColegaInput state={state} value={ov.colega ?? ''} onChange={(v) => changeOv({ colega: v })} />
              </Row>
              {covers.map((c) => (
                <Row key={c.id} icon="check">
                  Você cobre {c.colega || 'o colega'} em {fmtRange(parseDT(c.start), parseDT(c.end), false).replace(' · ', ', ')}
                </Row>
              ))}
              <div className="quick">
                <button className="btn-tonal" onClick={() => onAddCover(item)}>
                  <Icon name="add" size={18} /> {covers.length ? 'Outro plantão que vou cobrir' : 'Plantão que vou cobrir em troca'}
                </button>
              </div>
              <p className="hint pad-x">Na troca você continua recebendo por este plantão; o que você cobre não gera pagamento extra.</p>
            </div>
          )}
          <Row icon="notes">
            <textarea
              className="plain"
              rows={2}
              placeholder="Observação deste plantão"
              value={ov.note}
              onChange={(e) => changeOv({ note: e.target.value })}
            />
          </Row>
        </>
      )}

      {item.type === 'cover' && coveredShift && (
        <Row icon="swap">
          <span className="muted">Em troca do seu plantão de {fmtShortDate(parseDT(coveredShift.split('|')[1]))}</span>
        </Row>
      )}

      {(item.type === 'shift' || item.type === 'extra') && (
        <>
          <hr />
          <div className="field-label">Pagamento</div>
          {earn.fixed ? (
            <p className="hint pad-x">Escala com salário fixo — sem valor por plantão.</p>
          ) : earn.total > 0 ? (
            <>
              <div className="money-box">
                <strong>{brl(earn.total)}</strong>
                <div className="muted small">
                  {brl(earn.base)} base
                  {earn.night > 0 && ` + ${brl(earn.night)} noturno`}
                  {earn.holiday > 0 && ` + ${brl(earn.holiday)} feriado`}
                </div>
              </div>
              <Row icon="check">
                <div className="between">
                  <span>Já recebi</span>
                  <Switch
                    checked={!!live.paid}
                    onChange={(v) => (item.type === 'shift' ? changeOv({ paid: v }) : onPatchEvent(item.refId, { paid: v }))}
                  />
                </div>
              </Row>
            </>
          ) : (
            <p className="hint pad-x">
              {live.status === 'folga' ? 'Folga/falta não é paga.' : 'Sem valor definido. Toque em editar para informar quanto este plantão paga.'}
            </p>
          )}
        </>
      )}

      <hr />
      <div className="field-label">Neste dia</div>
      <div className="day-others">
        {others.length === 0 && <div className="muted">Nada mais neste dia.</div>}
        {others.map((o) => (
          <Chip key={o.key} item={o} showTime onClick={() => onItem(o)} />
        ))}
      </div>
      <div className="quick">
        <button className="btn-tonal" onClick={() => onAddEvent(day)}>
          <Icon name="event" size={18} /> Compromisso
        </button>
        <button className="btn-tonal" onClick={() => onAddNote(day)}>
          <Icon name="notes" size={18} /> Anotação
        </button>
      </div>
    </Sheet>
  );
}
