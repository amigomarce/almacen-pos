/**
 * Configuración de la app del dueño. Expo inyecta al compilar las variables `EXPO_PUBLIC_*`
 * (hay que accederlas de forma estática: `process.env.EXPO_PUBLIC_X`, no `process.env[x]`).
 * La anon key de Supabase es pública por diseño; los permisos los da nuestra API/RLS.
 */
export const CLOUD_URL = process.env.EXPO_PUBLIC_CLOUD_URL ?? 'http://127.0.0.1:3002';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
