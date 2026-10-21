import { useEffect, useMemo, useRef, useState } from 'react';
import { AgendaView } from './components/AgendaView';
import { Detail } from './components/Detail';
import { dayBefore, EscalaEditor, type Replace } from './components/EscalaEditor';
import { EventEditor, NoteEditor } from './components/Editors';
import { Search, SettingsScreen, Trocas } from './components/Extras';
import { HojeView } from './components/Hoje';
import { Icon, TodayIcon } from './components/Icon';
import { MonthView } from './components/MonthView';
import { Report, Resumo } from './components/Resumo';
import { Dialog, Drawer, EscalasList, Fab, MiniMonth, Snackbar, type DialogAction, type DrawerLink } from './components/Screens';
import { TimeGrid } from './components/TimeGrid';
import { addDays, addMonths, dateKey, dtKey, fmtShortDate, MONTHS, parseDT, startOfMonth, startOfWeek } from './lib/date';
import { escalaOccurrences, getItems, isWork, itemsStartingOn, type Item } from './lib/items';
import { useBackNavigation } from './lib/backNav';
import { checkReminders } from './lib/reminders';
import {
  newEscala, uid, useStore, type Escala, type EventKind, type Evento, type Nota, type ShiftOverride, type State, type View,
} from './lib/store';

type Sheet =
  | { t: 'event'; ev: Evento }
  | { t: 'note'; note: Nota }
  | { t: 'escala'; draft: Escala }
  | { t: 'detail'; item: Item }
  | { t: 'escalas' }
  | { t: 'resumo' }
  | { t: 'report'; month: Date }
  | { t: 'trocas' }
  | { t: 'search' }
  | { t: 'config' };

const STEP: Record<View, number> = { hoje: 0, agenda: 0, dia: 1, '3dias': 3, semana: 7, mes: 0 };

/**
 * Coloca a escala nova no lugar de outra.
 * - 'tudo': apaga a antiga; marcações (troca, pago, observação) migram para plantões da nova no mesmo horário.
 * - 'antes': a antiga termina na véspera do primeiro plantão da nova.
 */
function replaceEscala(s: State, rep: Replace, nova: Escala): State {
  if (rep.mode === 'antes') {
    const end = dayBefore(nova);
    return { ...s, escalas: s.escalas.map((x) => (x.id === rep.id && (!x.endDate || x.endDate > end) ? { ...x, endDate: end } : x)) };
  }
  const overrides = { ...s.overrides };
  const moved = new Map<string, string>();
  for (const [k, o] of Object.entries(s.overrides)) {
    if (!k.startsWith(`${rep.id}|`)) continue;
    delete overrides[k];
    const dt = k.split('|')[1];
    const start = parseDT(dt);
    const match = escalaOccurrences(nova, start, addDays(start, 1)).some((oc) => oc.start.getTime() === start.getTime());
    if (match && !o.removed) {
      overrides[`${nova.id}|${dt}`] = o;
      moved.set(k, `${nova.id}|${dt}`);
    }
  }
  return {
    ...s,
    escalas: s.escalas.filter((x) => x.id !== rep.id),
    overrides,
    eventos: s.eventos.map((ev) =>
      ev.trocaKey?.startsWith(`${rep.id}|`) ? { ...ev, trocaKey: moved.get(ev.trocaKey), escalaId: ev.escalaId === rep.id ? nova.id : ev.escalaId } : ev,
    ),
  };
}

/** Remove overrides que voltaram ao padrão. */
function setOverride(s: State, key: string, o: ShiftOverride): State {
  const overrides = { ...s.overrides };
  if (o.status === 'normal' && !o.note && !o.paid && !o.colega && !o.removed) delete overrides[key];
  else overrides[key] = o;
  return { ...s, overrides };
}

export default function App() {
  const [state, update] = useStore();
  const [cursor, setCursor] = useState(() => new Date());
  const [stack, setStack] = useState<Sheet[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [fab, setFab] = useState(false);
  const [picker, setPicker] = useState(false);
  const [pickerShown, setPickerShown] = useState(false);
  const [dialog, setDialog] = useState<{ text: string; actions: DialogAction[] } | null>(null);
  const [snack, setSnack] = useState<{ text: string; undo: State; id: number } | null>(null);

  const push = (s: Sheet) => setStack((st) => [...st, s]);
  const pop = () => setStack((st) => st.slice(0, -1));

  /* ---------- lembretes ---------- */
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const run = () => checkReminders(stateRef.current);
    run();
    const t = setInterval(run, 30e3);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);

  const view = state.view;
  /** Visão de onde o usuário abriu um dia; o botão voltar retorna para ela. */
  const [dayFrom, setDayFrom] = useState<View | null>(null);
  const setView = (v: View) => {
    update((s) => ({ ...s, view: v }));
    setDayFrom(null);
    setDrawer(false);
  };

  // o mini calendário continua montado até terminar a animação de fechar (.mini-wrap)
  useEffect(() => {
    if (picker) return setPickerShown(true);
    const t = window.setTimeout(() => setPickerShown(false), 320);
    return () => clearTimeout(t);
  }, [picker]);

  /* ---------- botão voltar do celular: fecha a camada de cima ---------- */
  const overlay = drawer || fab || picker;
  // "dia" aberto a partir de outra visão (ex.: mês) conta como uma camada a mais sobre ela
  const dayOver = view === 'dia' && !!dayFrom && dayFrom !== 'hoje' && dayFrom !== 'dia';
  const layers = { dialog: !!dialog, overlay, sheets: stack.length, view: view === 'hoje' ? 0 : dayOver ? 2 : 1 };
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const dayFromRef = useRef(dayFrom);
  dayFromRef.current = dayFrom;
  useBackNavigation(Number(layers.dialog) + Number(layers.overlay) + layers.sheets + layers.view, (n) => {
    const l = { ...layersRef.current };
    let sheets = 0;
    for (let i = 0; i < n; i++) {
      if (l.dialog) {
        setDialog(null);
        l.dialog = false;
      } else if (l.overlay) {
        setDrawer(false);
        setFab(false);
        setPicker(false);
        l.overlay = false;
      } else if (l.sheets > 0) {
        l.sheets--;
        sheets++;
      } else if (l.view === 2 && dayFromRef.current) {
        const back = dayFromRef.current;
        update((s) => ({ ...s, view: back }));
        setDayFrom(null);
        l.view = 1;
      } else if (l.view > 0) {
        update((s) => ({ ...s, view: 'hoje' }));
        setDayFrom(null);
        l.view = 0;
      }
    }
    if (sheets) setStack((st) => st.slice(0, st.length - sheets));
  });

  const move = (dir: 1 | -1) => {
    if (view === 'mes' || view === 'agenda') setCursor((c) => addMonths(c, dir));
    else if (view !== 'hoje') setCursor((c) => addDays(c, dir * STEP[view]));
  };
  const goDay = (d: Date) => {
    setCursor(d);
    if (view !== 'dia') setDayFrom(view);
    update((s) => ({ ...s, view: 'dia' }));
  };
  const openItem = (item: Item) => push({ t: 'detail', item });
  const openEscala = (id?: string) => {
    const existing = state.escalas.find((e) => e.id === id);
    push({ t: 'escala', draft: existing ?? newEscala({}, { startDate: dateKey(view === 'hoje' ? new Date() : cursor) }) });
  };

  /* ---------- criação ---------- */
  const newEvent = (kind: EventKind, at?: Date, extra: Partial<Evento> = {}) => {
    let start = at;
    if (!start) {
      start = new Date(view === 'hoje' ? new Date() : cursor);
      const now = new Date();
      if (dateKey(start) === dateKey(now) && kind === 'compromisso') start.setHours(now.getHours() + 1, 0, 0, 0);
      else start.setHours(kind === 'compromisso' ? 9 : 7, 0, 0, 0);
    }
    const end = new Date(start.getTime() + (kind === 'compromisso' ? 1 : 12) * 3600e3);
    push({
      t: 'event',
      ev: {
        id: uid(),
        kind,
        title: '',
        start: dtKey(start),
        end: dtKey(end),
        allDay: false,
        color: kind === 'extra' ? '#616161' : kind === 'cobertura' ? '#8e24aa' : '#039be5',
        location: '',
        description: '',
        value: kind === 'extra' ? state.settings.extraValue : undefined,
        repeat: 'none',
        ...extra,
      },
    });
  };
  const newNote = (d: Date = view === 'hoje' ? new Date() : cursor) =>
    push({ t: 'note', note: { id: uid(), date: dateKey(d), text: '', color: '#f6bf26' } });

  /** Plantão que vou cobrir em troca de um plantão meu. */
  const newCover = (shift?: Item) => {
    if (!shift) return newEvent('cobertura');
    const ov = shift.occKey ? state.overrides[shift.occKey] : undefined;
    const esc = state.escalas.find((e) => e.id === shift.refId);
    // sugere o mesmo horário no primeiro dia seguinte em que não trabalho (o usuário ajusta)
    let k = 1;
    for (; k < 60; k++) {
      const s = addDays(shift.start, k);
      const e = addDays(shift.end, k);
      const busy = getItems({ ...state, hidden: [] }, addDays(s, -1), addDays(e, 1)).some((i) => isWork(i) && i.start < e && i.end > s);
      if (!busy) break;
    }
    newEvent('cobertura', addDays(shift.start, k), {
      end: dtKey(addDays(shift.end, k)),
      colega: ov?.colega ?? '',
      escalaId: esc?.id,
      color: esc?.color ?? '#8e24aa',
      trocaKey: shift.occKey,
    });
  };

  /* ---------- persistência ---------- */
  const saveEvent = (ev: Evento) => {
    update((s) => {
      const prev = s.eventos.find((e) => e.id === ev.id);
      const settings = ev.kind === 'extra' && ev.value ? { ...s.settings, extraValue: ev.value } : s.settings;
      let next: State = { ...s, settings, eventos: prev ? s.eventos.map((e) => (e.id === ev.id ? ev : e)) : [...s.eventos, ev] };
      // cobertura ligada a um plantão meu: a troca vale nos dois sentidos
      if (prev?.trocaKey && prev.trocaKey !== ev.trocaKey) {
        const o = next.overrides[prev.trocaKey];
        if (o?.status === 'troca') next = setOverride(next, prev.trocaKey, { ...o, status: 'normal', colega: undefined });
      }
      if (ev.trocaKey) {
        const o = next.overrides[ev.trocaKey] ?? { status: 'normal', note: '' };
        next = setOverride(next, ev.trocaKey, { ...o, status: 'troca', colega: ev.colega || o.colega });
      }
      return next;
    });
    // volta para onde estava (ex.: detalhe do plantão trocado)
    setStack((st) => st.slice(0, -1).filter((x) => !(x.t === 'detail' && x.item.refId === ev.id)));
  };
  const saveNote = (n: Nota) => {
    update((s) => {
      if (!n.text) return { ...s, notas: s.notas.filter((x) => x.id !== n.id) };
      const exists = s.notas.some((x) => x.id === n.id);
      return { ...s, notas: exists ? s.notas.map((x) => (x.id === n.id ? n : x)) : [...s.notas, n] };
    });
    setStack((st) => st.slice(0, -1).filter((x) => !(x.t === 'detail' && x.item.refId === n.id)));
  };
  const patchEvent = (id: string, p: Partial<Evento>) =>
    update((s) => ({ ...s, eventos: s.eventos.map((e) => (e.id === id ? { ...e, ...p } : e)) }));

  /** Aplica uma exclusão, fecha as telas do item e mostra "Desfazer". */
  const remove = (text: string, fn: (s: State) => State, refId: string) => {
    const before = stateRef.current;
    update(fn);
    // fecha detalhes/editores do item excluído
    setStack((st) =>
      st.filter(
        (x) =>
          !(x.t === 'detail' && x.item.refId === refId) &&
          !(x.t === 'event' && x.ev.id === refId) &&
          !(x.t === 'note' && x.note.id === refId) &&
          !(x.t === 'escala' && x.draft.id === refId),
      ),
    );
    setDialog(null);
    setSnack({ text, undo: before, id: Date.now() });
  };
  const removeEvento = (id: string) => remove('Evento excluído', (s) => ({ ...s, eventos: s.eventos.filter((e) => e.id !== id) }), id);
  const removeNota = (id: string) => remove('Anotação excluída', (s) => ({ ...s, notas: s.notas.filter((n) => n.id !== id) }), id);
  const removeEscala = (id: string) =>
    remove(
      'Escala excluída',
      (s) => ({
        ...s,
        escalas: s.escalas.filter((x) => x.id !== id),
        overrides: Object.fromEntries(Object.entries(s.overrides).filter(([k]) => !k.startsWith(`${id}|`))),
      }),
      id,
    );

  const deleteItem = (item: Item) => {
    if (item.type === 'shift' && item.occKey) {
      const esc = state.escalas.find((e) => e.id === item.refId);
      return setDialog({
        text: `Excluir plantão de ${fmtShortDate(item.start)}`,
        actions: [
          {
            label: 'Só este plantão',
            run: () =>
              remove(
                'Plantão excluído',
                (s) => setOverride(s, item.occKey!, { ...(s.overrides[item.occKey!] ?? { status: 'normal', note: '' }), removed: true }),
                item.refId,
              ),
          },
          {
            label: 'Este e os seguintes',
            run: () =>
              remove(
                'Plantões excluídos a partir desta data',
                (s) => ({
                  ...s,
                  escalas: s.escalas.map((e) => (e.id === item.refId ? { ...e, endDate: dateKey(addDays(item.start, -1)) } : e)),
                }),
                item.refId,
              ),
          },
          { label: `Toda a escala${esc ? ` "${esc.name}"` : ''}`, run: () => removeEscala(item.refId) },
        ],
      });
    }
    if (item.type === 'note') return setDialog({ text: 'Excluir esta anotação?', actions: [{ label: 'Excluir', run: () => removeNota(item.refId) }] });
    if (item.recurring && item.occDate) {
      return setDialog({
        text: 'Excluir evento recorrente',
        actions: [
          {
            label: 'Só este',
            run: () =>
              remove(
                'Evento excluído',
                (s) => ({
                  ...s,
                  eventos: s.eventos.map((e) => (e.id === item.refId ? { ...e, exdates: [...(e.exdates ?? []), item.occDate!] } : e)),
                }),
                item.refId,
              ),
          },
          { label: 'Todos', run: () => removeEvento(item.refId) },
        ],
      });
    }
    setDialog({ text: 'Excluir este evento?', actions: [{ label: 'Excluir', run: () => removeEvento(item.refId) }] });
  };

  const editItem = (item: Item) => {
    if (item.type === 'shift') return openEscala(item.refId);
    if (item.type === 'note') {
      const n = state.notas.find((x) => x.id === item.refId);
      if (n) push({ t: 'note', note: n });
      return;
    }
    const ev = state.eventos.find((x) => x.id === item.refId);
    if (ev) push({ t: 'event', ev });
  };

  const markPaid = (items: Item[], paid: boolean) =>
    update((s) => {
      let next = s;
      for (const i of items) {
        if (i.type === 'shift' && i.occKey) {
          const cur = next.overrides[i.occKey] ?? { status: 'normal', note: '' };
          next = setOverride(next, i.occKey, { ...cur, paid });
        } else if (i.type === 'extra') {
          next = { ...next, eventos: next.eventos.map((e) => (e.id === i.refId ? { ...e, paid } : e)) };
        }
      }
      return next;
    });

  const onLink = (l: DrawerLink) => {
    setDrawer(false);
    if (l === 'relatorio') push({ t: 'report', month: startOfMonth(cursor) });
    else if (l === 'escalas' || l === 'trocas' || l === 'resumo' || l === 'config') push({ t: l });
  };

  /** Abre o item de uma troca (plantão cedido ou cobertura). */
  const openTroca = (key: string, start: Date) => {
    const found = getItems({ ...state, hidden: [] }, addDays(start, -1), addDays(start, 2)).find(
      (i) => i.key === key || i.refId === key,
    );
    if (found) openItem(found);
  };

  /* ---------- título ---------- */
  const now = new Date();
  const title =
    view === 'hoje' ? 'Hoje' : MONTHS[cursor.getMonth()] + (cursor.getFullYear() !== now.getFullYear() ? ` de ${cursor.getFullYear()}` : '');

  const renderSheet = (sh: Sheet) => {
    switch (sh.t) {
      case 'detail':
        return (
          <Detail
            key={sh.item.key}
            state={state}
            item={sh.item}
            onClose={pop}
            onEdit={() => editItem(sh.item)}
            onDelete={() => deleteItem(sh.item)}
            onOverride={(o) => update((s) => setOverride(s, sh.item.occKey!, o))}
            onPatchEvent={patchEvent}
            onAddEvent={(d) => {
              const at = new Date(d);
              at.setHours(9, 0, 0, 0);
              newEvent('compromisso', at);
            }}
            onAddNote={newNote}
            onAddCover={newCover}
            onItem={openItem}
          />
        );
      case 'event':
        return (
          <EventEditor
            key={sh.ev.id}
            state={state}
            initial={sh.ev}
            onSave={saveEvent}
            onClose={pop}
            onDelete={
              state.eventos.some((e) => e.id === sh.ev.id)
                ? () =>
                    setDialog({
                      text: (sh.ev.repeat ?? 'none') !== 'none' ? 'Excluir todas as ocorrências deste evento?' : 'Excluir este evento?',
                      actions: [{ label: 'Excluir', run: () => removeEvento(sh.ev.id) }],
                    })
                : undefined
            }
          />
        );
      case 'note':
        return (
          <NoteEditor
            key={sh.note.id}
            initial={sh.note}
            onSave={saveNote}
            onClose={pop}
            onDelete={
              state.notas.some((n) => n.id === sh.note.id)
                ? () => setDialog({ text: 'Excluir esta anotação?', actions: [{ label: 'Excluir', run: () => removeNota(sh.note.id) }] })
                : undefined
            }
          />
        );
      case 'escala': {
        const existing = state.escalas.find((e) => e.id === sh.draft.id);
        return (
          <EscalaEditor
            key={sh.draft.id}
            state={state}
            initial={existing ?? sh.draft}
            isNew={!existing}
            onClose={pop}
            onSave={(e, rep) => {
              const before = stateRef.current;
              const old = rep && state.escalas.find((x) => x.id === rep.id);
              update((s) => {
                const next = {
                  ...s,
                  escalas: s.escalas.some((x) => x.id === e.id) ? s.escalas.map((x) => (x.id === e.id ? e : x)) : [...s.escalas, e],
                };
                return rep ? replaceEscala(next, rep, e) : next;
              });
              // o detalhe aberto a partir de um plantão fica desatualizado após mudar a escala
              setStack((st) => st.slice(0, -1).filter((x) => x.t !== 'detail'));
              if (old) setSnack({ text: `Escala “${old.name}” substituída`, undo: before, id: Date.now() });
            }}
            onDelete={() =>
              setDialog({
                text: `Excluir a escala "${existing?.name}"? Todos os plantões gerados por ela serão removidos.`,
                actions: [{ label: 'Excluir', run: () => removeEscala(sh.draft.id) }],
              })
            }
          />
        );
      }
      case 'escalas':
        return <EscalasList state={state} onClose={pop} onEdit={(e) => openEscala(e.id)} onNew={() => openEscala()} />;
      case 'resumo':
        return <Resumo state={state} initial={cursor} onClose={pop} onMarkPaid={markPaid} onReport={(month) => push({ t: 'report', month })} />;
      case 'report':
        return <Report state={state} initial={sh.month} onClose={pop} />;
      case 'trocas':
        return <Trocas state={state} onClose={pop} onNewCover={() => newCover()} onOpen={(t) => openTroca(t.key, t.start)} />;
      case 'search':
        return <Search state={state} onClose={pop} onItem={openItem} />;
      case 'config':
        return <SettingsScreen state={state} onClose={pop} onChange={(p) => update((s) => ({ ...s, settings: { ...s.settings, ...p } }))} />;
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Menu">
          <Icon name="menu" />
        </button>
        <button className="title" onClick={() => setPicker(!picker)}>
          {title}
          <Icon name={picker ? 'dropup' : 'dropdown'} />
        </button>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => push({ t: 'search' })} aria-label="Pesquisar">
          <Icon name="search" />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            setCursor(new Date());
            setPicker(false);
          }}
          aria-label="Hoje"
        >
          <TodayIcon day={now.getDate()} />
        </button>
      </header>

      {pickerShown && (
        <MiniMonth
          closing={!picker}
          state={state}
          cursor={cursor}
          onPick={(d) => {
            setPicker(false);
            goDay(d);
          }}
        />
      )}

      <main className="main">
        {view === 'hoje' && (
          <HojeView
            state={state}
            onItem={openItem}
            onResumo={() => push({ t: 'resumo' })}
            onSettings={() => push({ t: 'config' })}
            onNewEscala={() => openEscala()}
          />
        )}
        {view === 'mes' && <MonthView state={state} cursor={cursor} onDay={goDay} onItem={openItem} onPrev={() => move(-1)} onNext={() => move(1)} />}
        {view === 'agenda' && <AgendaView state={state} cursor={cursor} onDay={goDay} onItem={openItem} />}
        {(view === 'dia' || view === '3dias' || view === 'semana') && (
          <TimeGrid
            state={state}
            start={view === 'semana' ? startOfWeek(cursor) : cursor}
            days={STEP[view]}
            onItem={openItem}
            onCreate={(at) => newEvent('compromisso', at)}
            onDay={goDay}
            onPrev={() => move(-1)}
            onNext={() => move(1)}
          />
        )}
      </main>

      <Fab
        open={fab}
        setOpen={setFab}
        actions={[
          { label: 'Escala', icon: 'repeat', run: () => openEscala() },
          { label: 'Cobertura de troca', icon: 'swap', run: () => newCover() },
          { label: 'Anotação', icon: 'notes', run: () => newNote() },
          { label: 'Plantão extra', icon: 'work', run: () => newEvent('extra') },
          { label: 'Compromisso', icon: 'event', run: () => newEvent('compromisso') },
        ]}
      />

      <Drawer
        open={drawer}
        state={state}
        onClose={() => setDrawer(false)}
        onView={setView}
        onToggle={(id) =>
          update((s) => ({ ...s, hidden: s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id] }))
        }
        onLink={onLink}
      />

      {/* todas as telas da pilha ficam montadas: voltar preserva o estado (ex.: busca digitada) */}
      {stack.map((sh, i) => (
        <div key={`${i}-${sh.t}`} className="sheet-layer" aria-hidden={i < stack.length - 1}>
          {renderSheet(sh)}
        </div>
      ))}

      {dialog && <Dialog text={dialog.text} actions={dialog.actions} onCancel={() => setDialog(null)} />}
      {snack && (
        <Snackbar
          key={snack.id}
          text={snack.text}
          onUndo={() => {
            update(() => snack.undo);
            setSnack(null);
          }}
          onDone={() => setSnack(null)}
        />
      )}
    </div>
  );
}
