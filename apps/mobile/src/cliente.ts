import { ClienteApi } from './api';
import { CLOUD_URL } from './config';

/** Cliente único de la nube; `App` le inyecta el token de Supabase cuando hay sesión. */
export const api = new ClienteApi(CLOUD_URL);
