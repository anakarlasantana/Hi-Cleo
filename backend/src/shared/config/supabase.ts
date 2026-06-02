import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// ⚠️ SEGURANÇA: service_role_key bypassa RLS.
// Usar apenas para operações server-side que precisam de acesso total.
// Futuro: criar um cliente com anon_key + RLS para queries de leitura.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
