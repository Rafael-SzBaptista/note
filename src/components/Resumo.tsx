import { useMemo, useState } from 'react';
import { addMonths, fmtHours, fmtTime, MONTHS, pad, startOfMonth, WEEKDAYS_SHORT } from '../lib/date';
import { itemHours, type Item } from '../lib/items';
import { brl, earnings, summarize } from '../lib/money';
import type { State } from '../lib/store';
import { Sheet } from './common';
import { Icon } from './Icon';

function MonthSwitch({ month, setMonth }: { month: Date; setMonth: (d: Date) => void }) {
  return (
    <div className="month-switch">
      <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior">
        <Icon name="left" />
      </button>
      <span>
        {MONTHS[month.getMonth()]} de {month.getFullYear()}
      </span>
      <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês">
        <Icon name="right" />
      </button>
    </div>
  );
}

/* ---------------- Resumo do mês ---------------- */

export function Resumo({
  state,
  initial,
  onClose,
  onMarkPaid,
  onReport,
}: {
  state: State;
  initial: Date;
  onClose: () => void;
  onMarkPaid: (items: Item[], paid: boolean) => void;
  onReport: (month: Date) => void;
}) {
  const [month, setMonth] = useState(startOfMonth(initial));
  const sum = useMemo(() => summarize(state, month, addMonths(month, 1)), [state, month.getTime()]);
  const missing = sum.total - sum.received;

  return (
    <Sheet onClose={onClose} closeIcon="back" title="Resumo do mês">
      <MonthSwitch month={month} setMonth={setMonth} />
      <div className="stats">
        <div>
          <strong>{sum.count}</strong>
          <span>plantões</span>
        </div>
        <div>
          <strong>{fmtHours(sum.hours)}</strong>
          <span>trabalhadas</span>
        </div>
        <div className="wide">
          <strong>{brl(sum.total)}</strong>
          <span>
            previsto · {brl(sum.received)} recebido{missing > 0 && <> · <b className="due">{brl(missing)} a receber</b></>}
          </span>
        </div>
        <div>
          <strong>{sum.compromissos}</strong>
          <span>compromissos</span>
        </div>
        <div>
          <strong>{sum.notas}</strong>
          <span>anotações</span>
        </div>
      </div>

      {sum.rows
        .filter((r) => r.items.length > 0 || state.escalas.some((e) => e.id === r.id))
        .map((r) => {
          const unpaid = r.payable.filter((i) => !i.paid);
          return (
            <div key={r.id} className="list-item static resumo-row">
              <span className="square sm" style={{ background: r.color }} />
              <div>
                <div className="between">
                  <span>{r.label}</span>
                  {r.total > 0 && <strong>{brl(r.total)}</strong>}
                </div>
                <div className="muted small">
                  {r.count} plantões · {fmtHours(r.hours)}
                  {!!r.trocas && ` · ${r.trocas} trocado(s)`}
                  {!!r.folgas && ` · ${r.folgas} folga(s)/falta(s)`}
                  {r.fixed && ' · salário fixo'}
                </div>
                {r.total > 0 && (
                  <div className="paid-line">
                    <span className={unpaid.length ? 'due' : 'ok'}>
                      {unpaid.length ? `${brl(r.total - r.received)} a receber` : 'Tudo recebido ✓'}
                    </span>
                    <button className="text-btn sm" onClick={() => onMarkPaid(r.payable, unpaid.length > 0)}>
                      {unpaid.length ? 'Marcar como recebido' : 'Desmarcar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      <div className="quick">
        <button className="btn-tonal" onClick={() => onReport(month)}>
          <Icon name="print" size={18} /> Relatório em PDF
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Relatório para imprimir / salvar PDF ---------------- */

const situacao = (i: Item) =>
  i.type === 'extra'
    ? 'Extra'
    : i.type === 'cover'
      ? `Cobertura${i.colega ? ` (${i.colega})` : ''}`
      : i.status === 'troca'
        ? `Trocado${i.colega ? ` (${i.colega})` : ''}`
        : i.status === 'folga'
          ? 'Folga/falta'
          : 'Trabalhado';

export function Report({ state, initial, onClose }: { state: State; initial: Date; onClose: () => void }) {
  const [month, setMonth] = useState(startOfMonth(initial));
  const [filter, setFilter] = useState('');
  const sum = useMemo(() => summarize(state, month, addMonths(month, 1)), [state, month.getTime()]);
  const rows = sum.rows
    .filter((r) => !filter || r.id === filter)
    .flatMap((r) => r.items)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const s = state.settings;
  const tot = rows.reduce(
    (a, i) => {
      const e = earnings(i, s);
      const worked = i.status !== 'folga' && i.status !== 'troca';
      return { h: a.h + (worked ? itemHours(i) : 0), v: a.v + e.total, p: a.p + (i.paid ? e.total : 0) };
    },
    { h: 0, v: 0, p: 0 },
  );
  const d2 = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

  return (
    <Sheet
      onClose={onClose}
      closeIcon="back"
      title="Relatório"
      action={
        <button className="btn-filled" onClick={() => window.print()}>
          <Icon name="print" size={18} /> PDF
        </button>
      }
    >
      <div className="no-print">
        <MonthSwitch month={month} setMonth={setMonth} />
        <div className="pad-x">
          <select className="plain select boxed" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas as escalas</option>
            {sum.rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="hint">Toque em “PDF” e escolha “Salvar como PDF” na janela de impressão.</p>
        </div>
      </div>
      <div className="report">
        <h1>
          Plantões — {MONTHS[month.getMonth()]} de {month.getFullYear()}
        </h1>
        <p className="report-sub">
          {filter ? sum.rows.find((r) => r.id === filter)?.label : 'Todas as escalas'} · gerado pelo Note em{' '}
          {new Date().toLocaleDateString('pt-BR')}
        </p>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Local</th>
              <th>Horário</th>
              <th>Horas</th>
              <th>Situação</th>
              <th>Valor</th>
              <th>Recebido</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="center">
                  Nenhum plantão neste mês.
                </td>
              </tr>
            )}
            {rows.map((i) => {
              const e = earnings(i, s);
              return (
                <tr key={i.key} className={i.status === 'folga' || i.status === 'troca' ? 'dim' : ''}>
                  <td>
                    {WEEKDAYS_SHORT[i.start.getDay()]} {d2(i.start)}
                  </td>
                  <td>
                    {i.title}
                    {i.turno ? ` (${i.turno})` : ''}
                  </td>
                  <td>
                    {fmtTime(i.start)}–{fmtTime(i.end)}
                    {i.end.getDate() !== i.start.getDate() && <sup>+1</sup>}
                  </td>
                  <td>{fmtHours(itemHours(i))}</td>
                  <td>{situacao(i)}</td>
                  <td>{e.fixed ? 'fixo' : e.total ? brl(e.total) : '—'}</td>
                  <td>{e.total ? (i.paid ? 'Sim' : 'Não') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total ({rows.filter((i) => i.status !== 'folga' && i.status !== 'troca').length} trabalhados)</td>
              <td>{fmtHours(tot.h)}</td>
              <td />
              <td>{brl(tot.v)}</td>
              <td>{brl(tot.p)}</td>
            </tr>
          </tfoot>
        </table>
        {tot.v - tot.p > 0 && <p className="report-due">A receber: {brl(tot.v - tot.p)}</p>}
        <p className="report-foot">
          Adicional noturno: {s.nightPct}% (22h–5h) · Feriados nacionais: +{s.holidayPct}% · Valores estimados a partir das regras cadastradas.
        </p>
      </div>
    </Sheet>
  );
}
