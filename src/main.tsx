import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Login, NotConfigured } from './components/Login';
import { useSession } from './lib/auth';
import { supabaseConfigured } from './lib/supabase';
import './styles.css';
import './screens.css';

function Root() {
  const session = useSession();
  if (!supabaseConfigured) return <NotConfigured />;
  if (session === undefined) return null; // verificando sessão salva
  return session ? <App /> : <Login />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// o service worker também é necessário para notificações no Android
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
