/**
 * Configuración de la app del dueño. Las variables `EXPO_PUBLIC_*` las inyecta Expo al
 * compilar (no son secretos salvo la anon key de Supabase, que es pública por diseño).
 */
function variable(nombre: string): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const v = env[nombre];
  return v && v.trim() !== '' ? v : undefined;
}

export const CLOUD_URL = variable('EXPO_PUBLIC_CLOUD_URL') ?? 'http://127.0.0.1:3002';
export const SUPABASE_URL = variable('EXPO_PUBLIC_SUPABASE_URL') ?? '';
export const SUPABASE_ANON_KEY = variable('EXPO_PUBLIC_SUPABASE_ANON_KEY') ?? '';
