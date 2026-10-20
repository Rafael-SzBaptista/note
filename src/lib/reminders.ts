import { fmtTime } from './date';
import { getItems, isWork } from './items';
import type { State } from './store';

/*
 * Lembretes por notificação do navegador.
 * Limitação da web: sem um servidor de push, a verificação só roda enquanto o app
 * estiver aberto ou em segundo plano recente (instalado como app funciona melhor).
 */

const SENT_KEY = 'note:notified';

function sentSet(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveSent(s: Record<string, number>) {
  try {
    const now = Date.now();
    // descarta registros com mais de 3 dias
    localStorage.setItem(SENT_KEY, JSON.stringify(Object.fromEntries(Object.entries(s).filter(([, t]) => now - t < 3 * 864e5))));
  } catch {
    /* armazenamento indisponível */
  }
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function askPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export async function notify(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: '/icon.svg', badge: '/icon.svg' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, opts));
  } catch {
    /* cai para a API direta */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* sem suporte (ex.: Android sem service worker) */
  }
}

/** Verifica itens que começam dentro da antecedência configurada e notifica uma única vez. */
export function checkReminders(state: State) {
  const s = state.settings;
  if (!s.reminders || !notificationsSupported() || Notification.permission !== 'granted') return;
  const now = new Date();
  const until = new Date(now.getTime() + s.remindMin * 60e3);
  const sent = sentSet();
  let changed = false;
  for (const it of getItems(state, now, until)) {
    if (it.allDay || it.start < now || it.start > until) continue;
    const work = isWork(it);
    if (!work && !(s.remindEvents && it.type === 'event')) continue;
    const tag = `${it.key}@${it.start.getTime()}`;
    if (sent[tag]) continue;
    const mins = Math.round((it.start.getTime() - now.getTime()) / 60e3);
    const when = mins >= 60 ? `em ${Math.floor(mins / 60)}h${mins % 60 ? String(mins % 60).padStart(2, '0') : ''}` : `em ${mins} min`;
    notify(work ? `Plantão ${when}: ${it.title}` : `${it.title} ${when}`, `${fmtTime(it.start)} – ${fmtTime(it.end)}${it.location ? ` · ${it.location}` : ''}`, tag);
    sent[tag] = Date.now();
    changed = true;
  }
  if (changed) saveSent(sent);
}
