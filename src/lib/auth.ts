import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Sessão atual do Supabase Auth; `undefined` enquanto carrega. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Senha fraca. Use pelo menos 6 caracteres.',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
};

export function authMessage(e: { code?: string; message: string }) {
  return (e.code && MESSAGES[e.code]) || e.message;
}

export const signIn = (email: string, password: string) => supabase.auth.signInWithPassword({ email, password });

export const signUp = (email: string, password: string) => supabase.auth.signUp({ email, password });

export const resetPassword = (email: string) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });

export const signOut = () => supabase.auth.signOut();
