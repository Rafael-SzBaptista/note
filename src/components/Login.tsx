import { useState, type FormEvent } from 'react';
import { authMessage, resetPassword, signIn, signUp } from '../lib/auth';
import { Icon, type IconName } from './Icon';
import { Logo } from './Screens';

type Mode = 'entrar' | 'criar' | 'recuperar';

const COPY: Record<Mode, { title: string; sub: string; cta: string }> = {
  entrar: { title: 'Bem-vindo de volta', sub: 'Entre para ver suas escalas e plantões.', cta: 'Entrar' },
  criar: { title: 'Crie sua conta', sub: 'Seus plantões salvos e seguros, em qualquer aparelho.', cta: 'Criar conta' },
  recuperar: { title: 'Recuperar senha', sub: 'Enviaremos um link para você criar uma nova senha.', cta: 'Enviar link' },
};

/** Calendário decorativo do topo: plantões 12x36 alternando dia e noite. */
function Hero() {
  const days = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div className="login-hero">
      <div className="login-hero-brand">
        <span className="login-logo">
          <Logo size={44} />
        </span>
        <h1>Note</h1>
        <p>Suas escalas, trocas e pagamentos num só lugar.</p>
      </div>
      <div className="login-cal" aria-hidden="true">
        {days.map((i) => (
          <span key={i} className={i % 2 === 0 ? 'on' : i % 7 === 3 ? 'swap' : ''} />
        ))}
      </div>
    </div>
  );
}

function Field({
  icon,
  right,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: IconName; right?: React.ReactNode }) {
  return (
    <label className="login-field">
      <Icon name={icon} size={20} />
      <input {...props} />
      {right}
    </label>
  );
}

export function Login() {
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const mail = email.trim();
    try {
      if (mode === 'entrar') {
        const { error } = await signIn(mail, password);
        if (error) setError(authMessage(error));
      } else if (mode === 'criar') {
        const { data, error } = await signUp(mail, password);
        if (error) setError(authMessage(error));
        else if (!data.session) setInfo('Conta criada! Confirme seu e-mail para entrar.');
      } else {
        const { error } = await resetPassword(mail);
        if (error) setError(authMessage(error));
        else setInfo('Se o e-mail existir, enviamos um link para redefinir a senha.');
      }
    } catch {
      setError('Não foi possível conectar. Verifique sua internet.');
    }
    setBusy(false);
  };

  const copy = COPY[mode];

  return (
    <div className="login">
      <div className="login-shell">
        <Hero />
        <form className="login-panel" onSubmit={submit}>
          {mode !== 'recuperar' && (
            <div className="login-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'entrar'} className={mode === 'entrar' ? 'on' : ''} onClick={() => go('entrar')}>
                Entrar
              </button>
              <button type="button" role="tab" aria-selected={mode === 'criar'} className={mode === 'criar' ? 'on' : ''} onClick={() => go('criar')}>
                Criar conta
              </button>
            </div>
          )}

          <div className="login-head">
            <h2>{copy.title}</h2>
            <p>{copy.sub}</p>
          </div>

          <Field
            icon="mail"
            type="email"
            placeholder="E-mail"
            aria-label="E-mail"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode !== 'recuperar' && (
            <Field
              icon="lock"
              type={show ? 'text' : 'password'}
              placeholder="Senha"
              aria-label="Senha"
              autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              right={
                <button type="button" className="login-eye" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
                </button>
              }
            />
          )}
          {mode === 'criar' && <p className="login-tip">Mínimo de 6 caracteres.</p>}
          {mode === 'entrar' && (
            <button type="button" className="login-forgot" onClick={() => go('recuperar')}>
              Esqueci minha senha
            </button>
          )}

          {error && (
            <div className="login-alert err" role="alert">
              <Icon name="warning" size={18} /> {error}
            </div>
          )}
          {info && (
            <div className="login-alert ok" role="status">
              <Icon name="check" size={18} /> {info}
            </div>
          )}

          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? <span className="login-spin" aria-hidden="true" /> : copy.cta}
          </button>

          {mode === 'recuperar' && (
            <button type="button" className="login-back" onClick={() => go('entrar')}>
              <Icon name="back" size={18} /> Voltar para entrar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="login">
      <div className="login-shell single">
        <div className="login-panel">
          <span className="login-logo plain">
            <Logo size={44} />
          </span>
          <div className="login-head">
            <h2>Configuração pendente</h2>
            <p>Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env e reinicie o servidor.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
