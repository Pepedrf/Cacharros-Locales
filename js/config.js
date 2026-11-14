// ============================================================
//  CONFIGURACIÓN · lo único que tienes que tocar para desplegar
// ============================================================
//  Supabase → Project Settings → API (o "Connect"):
//    - Project URL                → SUPABASE_URL
//    - anon / publishable key     → SUPABASE_ANON_KEY
//  (Esta clave es pública por diseño: la seguridad la ponen las
//   políticas RLS del schema.sql. NUNCA pongas aquí la service_role.)
//
//  Si los dejas vacíos, la app arranca en MODO DEMO con datos de
//  ejemplo guardados solo en tu navegador.
// ============================================================
export const CONFIG = {
  APP_NAME: 'Cacharros Locales',
  TAGLINE: 'El diario de cacharros de los Héroes Locales',
  SUPABASE_URL: 'https://qtsudnwajjwcuqitflmc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_u8DOQu1r9I0eoaBQEiI0Gg_EAHwwLiy',
};
