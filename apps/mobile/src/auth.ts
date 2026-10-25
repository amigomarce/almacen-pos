import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Inicia sesión con correo y contraseña (Supabase Auth). */
export async function entrar(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function salir(): Promise<void> {
  await supabase.auth.signOut();
}

export async function sesionActual(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Avisa cuando la sesión cambia (login, logout, refresh). Devuelve cómo dejar de escuchar. */
export function alCambiarSesion(oyente: (sesion: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
    oyente(sesion);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
