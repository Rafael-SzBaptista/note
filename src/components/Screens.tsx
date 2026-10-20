import { useEffect, useState } from 'react';
import { addDays, addMonths, MONTHS, sameDay, startOfMonth, startOfWeek, WEEKDAY_LETTER } from '../lib/date';
import { sortedVersions } from '../lib/items';
import type { Escala, State, View } from '../lib/store';
import { Sheet } from './common';
import { describeRegra } from './EscalaEditor';
import { Icon, type IconName } from './Icon';

/* ---------------- Lista de escalas ---------------- */

export function EscalasList({ state, onClose, onEdit, onNew }: { state: State; onClose: () => void; onEdit: (e: Escala) => void; onNew: () => void }) {
  return (
    <Sheet onClose={onClose} closeIcon="back" title="Escalas de trabalho">
      {state.escalas.length === 0 && <p className="muted pad">Nenhuma escala ainda. Crie uma para gerar seus plantões automaticamente.</p>}
      {state.escalas.map((e) => {
        const vs = sortedVersions(e);
        const cur = vs[vs.length - 1];
        return (
          <button key={e.id} className="list-item" onClick={() => onEdit(e)}>
            <span className="square sm" style={{ background: e.color }} />
            <div>
              <div>{e.name}</div>
              <div className="muted small">
                {describeRegra(cur)}
                {vs.length > 1 && ` · ${vs.length} mudanças no histórico`}
              </div>
            </div>
            <Icon name="right" />
          </button>
        );
      })}
      <button className="list-item add" onClick={onNew}>
        <Icon name="add" />
        <div>Nova escala</div>
      </button>
    </Sheet>
  );
}

/* ---------------- Gaveta lateral ---------------- */

const VIEWS: { v: View; label: string; icon: IconName }[] = [
  { v: 'hoje', label: 'Hoje', icon: 'home' },
  { v: 'agenda', label: 'Programação', icon: 'agenda' },
  { v: 'dia', label: 'Dia', icon: 'day' },
  { v: '3dias', label: '3 dias', icon: 'three' },
  { v: 'semana', label: 'Semana', icon: 'week' },
  { v: 'mes', label: 'Mês', icon: 'month' },
];

export type DrawerLink = 'escalas' | 'trocas' | 'resumo' | 'relatorio' | 'config';

const LINKS: { id: DrawerLink; label: string; icon: IconName }[] = [
  { id: 'escalas', label: 'Escalas de trabalho', icon: 'repeat' },
  { id: 'trocas', label: 'Trocas de plantão', icon: 'people' },
  { id: 'resumo', label: 'Resumo e pagamentos', icon: 'money' },
  { id: 'relatorio', label: 'Relatório em PDF', icon: 'print' },
  { id: 'config', label: 'Configurações', icon: 'settings' },
];

export function Drawer({
  open,
  state,
  onClose,
  onView,
  onToggle,
  onLink,
}: {
  open: boolean;
  state: State;
  onClose: () => void;
  onView: (v: View) => void;
  onToggle: (id: string) => void;
  onLink: (l: DrawerLink) => void;
}) {
  const cals = [
    ...state.escalas.map((e) => ({ id: e.id, label: e.name, color: e.color })),
    { id: 'extras', label: 'Plantões extras', color: '#616161' },
    { id: 'coberturas', label: 'Coberturas de troca', color: '#8e24aa' },
    { id: 'eventos', label: 'Compromissos', color: '#039be5' },
    { id: 'notas', label: 'Anotações', color: '#f6bf26' },
    { id: 'feriados', label: 'Feriados no Brasil', color: '#0b8043' },
  ];
  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <nav className={`drawer${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="brand">
          <Logo /> <span>Note</span>
        </div>
        {VIEWS.map(({ v, label, icon }) => (
          <button key={v} className={`nav-item${state.view === v ? ' on' : ''}`} onClick={() => onView(v)}>
            <Icon name={icon} /> {label}
          </button>
        ))}
        <hr />
        {LINKS.map(({ id, label, icon }) => (
          <button key={id} className="nav-item" onClick={() => onLink(id)}>
            <Icon name={icon} /> {label}
          </button>
        ))}
        <hr />
        <div className="nav-label">Agendas</div>
        {cals.map((c) => {
          const on = !state.hidden.includes(c.id);
          return (
            <button key={c.id} className="nav-item check" onClick={() => onToggle(c.id)}>
              <span className="cb" style={{ borderColor: c.color, background: on ? c.color : 'transparent' }}>
                {on && <Icon name="check" size={16} />}
              </span>
              {c.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="4" y="6" width="40" height="38" rx="8" fill="#0b57d0" />
      <rect x="4" y="6" width="40" height="11" rx="5" fill="#4c8df6" />
      <path d="M16 36V22l16 14V22" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Botão flutuante ---------------- */

export function Fab({ open, setOpen, actions }: { open: boolean; setOpen: (v: boolean) => void; actions: { label: string; icon: IconName; run: () => void }[] }) {
  return (
    <>
      <div className={`fab-scrim${open ? ' show' : ''}`} onClick={() => setOpen(false)} />
      <div className={`fab-wrap${open ? ' open' : ''}`}>
        {open &&
          actions.map((a, i) => (
            <button
              key={a.label}
              className="fab-action"
              style={{ animationDelay: `${(actions.length - i) * 30}ms` }}
              onClick={() => {
                setOpen(false);
                a.run();
              }}
            >
              <span className="fab-label">{a.label}</span>
              <span className="fab-mini">
                <Icon name={a.icon} />
              </span>
            </button>
          ))}
        <button className="fab" onClick={() => setOpen(!open)} aria-label={open ? 'Fechar' : 'Criar'}>
          <Icon name={open ? 'close' : 'add'} size={28} />
        </button>
      </div>
    </>
  );
}

/* ---------------- Mini calendário (ao tocar no mês) ---------------- */

export function MiniMonth({ cursor, onPick, dots }: { cursor: Date; onPick: (d: Date) => void; dots: (d: Date) => string[] }) {
  const [m, setM] = useState(startOfMonth(cursor));
  const start = startOfWeek(m);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date();
  return (
    <div className="mini">
      <div className="mini-head">
        <button className="icon-btn" onClick={() => setM(addMonths(m, -1))} aria-label="Mês anterior">
          <Icon name="left" />
        </button>
        <span>
          {MONTHS[m.getMonth()]} {m.getFullYear()}
        </span>
        <button className="icon-btn" onClick={() => setM(addMonths(m, 1))} aria-label="Próximo mês">
          <Icon name="right" />
        </button>
      </div>
      <div className="mini-grid">
        {WEEKDAY_LETTER.map((l, i) => (
          <span key={i} className="mini-wd">
            {l}
          </span>
        ))}
        {days.map((d) => (
          <button
            key={d.getTime()}
            className={`mini-day${d.getMonth() !== m.getMonth() ? ' out' : ''}${sameDay(d, today) ? ' today' : ''}${sameDay(d, cursor) ? ' sel' : ''}`}
            onClick={() => onPick(d)}
          >
            {d.getDate()}
            <i>
              {dots(d).slice(0, 3).map((c, i) => (
                <b key={i} style={{ background: c }} />
              ))}
            </i>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Diálogo ---------------- */

export interface DialogAction {
  label: string;
  run: () => void;
}

export function Dialog({ text, actions, onCancel }: { text: string; actions: DialogAction[]; onCancel: () => void }) {
  return (
    <div className="dialog-wrap" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className={`dialog-actions${actions.length > 1 ? ' stack' : ''}`}>
          {actions.length > 1 &&
            actions.map((a) => (
              <button key={a.label} className="text-btn" onClick={a.run}>
                {a.label}
              </button>
            ))}
          <button className="text-btn" onClick={onCancel}>
            Cancelar
          </button>
          {actions.length === 1 && (
            <button className="text-btn" onClick={actions[0].run}>
              {actions[0].label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Aviso com "Desfazer" ---------------- */

export function Snackbar({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="snackbar" role="status">
      <span>{text}</span>
      <button onClick={onUndo}>Desfazer</button>
    </div>
  );
}
