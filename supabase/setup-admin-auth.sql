-- ============================================================================
--  Setup de autenticación del panel admin
--  Proyecto: sistema-turnos-padel
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================================
--
--  1) CREAR EL USUARIO ADMIN
--  ---------------------------
--  La app usa Supabase Auth (email + contraseña). El usuario NO se crea por
--  SQL de forma confiable; hacelo desde el Dashboard:
--
--    Authentication → Users → "Add user" → "Create new user"
--      · Email:       admin@tucomplejo.com
--      · Password:    (la que quieras, min. 6 caracteres)
--      · ☑ Auto Confirm User
--
--  Guardá las credenciales: son las que se usan en /admin/login.
--
--  Si necesitás crearlo desde el Dashboard por única vez, nada más: no
--  hace falta ejecutar este archivo para que el login funcione. El SQL de
--  abajo es la parte 2 (defensa en profundidad) y es opcional.
--
--
--  2) RLS — RECOMENDADO (defensa en profundidad)
--  ---------------------------------------------
--  La guard de rutas (/admin) ya impide que un anónimo vea el panel, pero la
--  VITE_SUPABASE_ANON_KEY viaja en el bundle de JavaScript: cualquiera que
--  abra la DevTools puede leer/escribir las tablas directamente mientras las
--  políticas permitan acceso a `anon`.
--
--  Estas políticas cierran la escritura. OJO con el bloque de `turnos`:
--  la vista de cancelación (/?token=...) necesita lectura y actualización
--  anónimas, así que esas dos se mantienen abiertas a propósito. Restringirlas
--  exige mover la cancelación a una Edge Function.
--
-- ============================================================================

-- ─── canchas ────────────────────────────────────────────────────────────────
alter table public.canchas enable row level security;

drop policy if exists "canchas lectura pública" on public.canchas;
create policy "canchas lectura pública"
  on public.canchas for select
  to anon, authenticated
  using (true);

drop policy if exists "canchas escritura sólo admin" on public.canchas;
create policy "canchas escritura sólo admin"
  on public.canchas for all
  to authenticated
  using (true)
  with check (true);

-- ─── articulos ─────────────────────────────────────────────────────────────
alter table public.articulos enable row level security;

drop policy if exists "articulos lectura pública" on public.articulos;
create policy "articulos lectura pública"
  on public.articulos for select
  to anon, authenticated
  using (true);

drop policy if exists "articulos escritura sólo admin" on public.articulos;
create policy "articulos escritura sólo admin"
  on public.articulos for all
  to authenticated
  using (true)
  with check (true);

-- ─── turnos ────────────────────────────────────────────────────────────────
alter table public.turnos enable row level security;

-- El cliente necesita leer la disponibilidad para pintar la grilla.
drop policy if exists "turnos lectura pública" on public.turnos;
create policy "turnos lectura pública"
  on public.turnos for select
  to anon, authenticated
  using (true);

-- La cancelación autodidacta (/?token=...) actualiza el estado con el token.
-- Se mantiene abierta a propósito; ver la nota del encabezado.
drop policy if exists "turnos cancelación por token" on public.turnos;
create policy "turnos cancelación por token"
  on public.turnos for update
  to anon, authenticated
  using (true)
  with check (true);

-- Crear, editar y eliminar turnos: sólo con sesión iniciada.
drop policy if exists "turnos escritura sólo admin" on public.turnos;
create policy "turnos escritura sólo admin"
  on public.turnos for insert
  to authenticated
  with check (true);

drop policy if exists "turnos modificación sólo admin" on public.turnos;
create policy "turnos modificación sólo admin"
  on public.turnos for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "turnos borrado sólo admin" on public.turnos;
create policy "turnos borrado sólo admin"
  on public.turnos for delete
  to authenticated
  using (true);
