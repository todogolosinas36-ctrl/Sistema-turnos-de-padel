-- ============================================================================
--  Esquema completo — sistema-turnos-padel
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
--
--  Es IDEMPOTENTE: podés correrlo las veces que quieras, no rompe nada.
--  La tabla `turnos` y `canchas` ya existen; acá sólo se les agregan columnas
--  faltantes y se crean las que faltan.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
--  1) turnos — columnas que la app necesita y no existían
-- ────────────────────────────────────────────────────────────────────────────
--  La tabla ya tiene: id, cancha_id, fecha, hora_inicio, hora_fin,
--  duracion_minutos, cliente_nombre, cliente_apellido, cliente_telefono,
--  estado, token_cancelacion, motivo_cancelacion, cancelado_el, es_fijo,
--  notas, creado_el

alter table public.turnos add column if not exists origen text;              -- 'cliente' | 'admin'
alter table public.turnos add column if not exists precio integer;             -- total real cobrado
alter table public.turnos add column if not exists total_base_cancha integer; -- tarifa aplicada
alter table public.turnos add column if not exists gastos_compartidos jsonb default '[]'::jsonb;
alter table public.turnos add column if not exists detalle_cobro jsonb;        -- split por jugador
alter table public.turnos add column if not exists cobrado_el timestamptz;
alter table public.turnos add column if not exists turno_fijo_id uuid;

-- Índice de las consultas más frecuentes: la agenda del día y la caja.
create index if not exists turnos_fecha_idx on public.turnos (fecha);
create index if not exists turnos_estado_idx on public.turnos (estado);

-- El índice único del token es lo que hace que la cancelación funcione:
-- CancelacionView usa .maybeSingle(), que falla si hay dos filas con el mismo
-- token. Antes de crearlo, chequeamos que no haya duplicados.
do $$
declare
  dupes text;
begin
  select string_agg(t.token_cancelacion::text, ', ')
    into dupes
  from (
    select token_cancelacion
    from public.turnos
    where token_cancelacion is not null
    group by token_cancelacion
    having count(*) > 1
  ) t;

  if dupes is not null then
    raise exception
      'Hay token_cancelacion duplicados: %. Corregilos antes de seguir (UPDATE turnos SET token_cancelacion = gen_random_uuid() WHERE id IN (...)).',
      dupes;
  end if;
end $$;

create unique index if not exists turnos_token_idx
  on public.turnos (token_cancelacion)
  where token_cancelacion is not null;

-- El origen queda controlado por la app; se evita mandar cualquier string.
alter table public.turnos drop constraint if exists turnos_origen_check;
alter table public.turnos add constraint turnos_origen_check
  check (origen is null or origen in ('cliente', 'admin'));

-- Estados que la app maneja: confirmado, pagado, cancelado
alter table public.turnos drop constraint if exists turnos_estado_check;
alter table public.turnos add constraint turnos_estado_check
  check (estado in ('confirmado', 'pagado', 'cancelado'));


-- ────────────────────────────────────────────────────────────────────────────
--  1b) articulos — columna de categoría (la usan los filtros del POS)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.articulos add column if not exists categoria text;

-- Valores por defecto para los artículos que ya existan, para que el POS
-- no muestre todo en un único grupo.
update public.articulos set categoria = 'Otros' where categoria is null or categoria = '';

create index if not exists articulos_categoria_idx on public.articulos (categoria);


-- ────────────────────────────────────────────────────────────────────────────
--  2) turnos_fijos — los abonos (no existía; vivían en localStorage)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.turnos_fijos (
  id                uuid primary key default gen_random_uuid(),
  dia               text        not null,
  hora_inicio       time        not null,
  duracion_minutos  integer     not null default 120,
  cancha_id         uuid        not null references public.canchas (id) on delete cascade,
  cliente           text        not null,
  telefono          text,
  activo            boolean     not null default true,
  notas             text,
  creado_el         timestamptz not null default now()
);

alter table public.turnos_fijos drop constraint if exists turnos_fijos_dia_check;
alter table public.turnos_fijos add constraint turnos_fijos_dia_check
  check (dia in ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'));

alter table public.turnos_fijos drop constraint if exists turnos_fijos_duracion_check;
alter table public.turnos_fijos add constraint turnos_fijos_duracion_check
  check (duracion_minutos between 30 and 480);

create index if not exists turnos_fijos_dia_idx on public.turnos_fijos (dia, activo);

-- FK del override: un turno generado desde un abono apunta al abono.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'turnos_turno_fijo_id_fkey'
  ) then
    alter table public.turnos
      add constraint turnos_turno_fijo_id_fkey
      foreign key (turno_fijo_id) references public.turnos_fijos (id) on delete set null;
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
--  3) ventas_cantina — el POS. Se llama así a propósito para no chocar con
--     la tabla `ventas` que ya existe en este proyecto de Supabase y
--     pertenece a otra aplicación.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.ventas_cantina (
  id             uuid primary key default gen_random_uuid(),
  fecha          date    not null default current_date,
  hora           time    not null default localtime,
  metodo_pago    text    not null,
  total          integer not null check (total >= 0),
  cantidad_items integer not null default 0,
  ticket         text,
  creado_el      timestamptz not null default now()
);

alter table public.ventas_cantina drop constraint if exists ventas_cantina_metodo_check;
alter table public.ventas_cantina add constraint ventas_cantina_metodo_check
  check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta', 'debito', 'credito', 'mixto') or metodo_pago like 'Mixto%');

create index if not exists ventas_cantina_fecha_idx on public.ventas_cantina (fecha);

-- El detalle guarda una foto del nombre y precio: si mañana cambia el precio
-- del artículo, el histórico de caja tiene que seguir diciendo lo que se cobró.
-- `articulo_id` es texto (y no FK) porque no todas las instalaciones de
-- articulos usan id uuid.
create table if not exists public.ventas_cantina_detalle (
  id          uuid primary key default gen_random_uuid(),
  venta_id    uuid    not null references public.ventas_cantina (id) on delete cascade,
  articulo_id text,
  nombre      text    not null,
  precio      integer not null,
  cantidad    integer not null check (cantidad > 0)
);

create index if not exists ventas_cantina_detalle_venta_idx
  on public.ventas_cantina_detalle (venta_id);


-- ────────────────────────────────────────────────────────────────────────────
--  4) RLS
-- ────────────────────────────────────────────────────────────────────────────
--  La app ya protege /admin con Supabase Auth (ver setup-admin-auth.sql).
--  Acá se cierra la escritura directa vía la anon key del bundle.

alter table public.turnos enable row level security;

drop policy if exists "turnos lectura pública" on public.turnos;
create policy "turnos lectura pública"
  on public.turnos for select to anon, authenticated using (true);

-- La cancelación autodidacta (/?token=...) actualiza con el token.
-- Se mantiene abierta a propósito; cerrarla exige mover el flujo a una
-- Edge Function (ver la nota en setup-admin-auth.sql).
drop policy if exists "turnos cancelación por token" on public.turnos;
create policy "turnos cancelación por token"
  on public.turnos for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "turnos insert sólo admin" on public.turnos;
create policy "turnos insert sólo admin"
  on public.turnos for insert to authenticated with check (true);

drop policy if exists "turnos update sólo admin" on public.turnos;
create policy "turnos update sólo admin"
  on public.turnos for update to authenticated using (true) with check (true);

drop policy if exists "turnos delete sólo admin" on public.turnos;
create policy "turnos delete sólo admin"
  on public.turnos for delete to authenticated using (true);

-- ─── canchas ───────────────────────────────────────────────────────────────
alter table public.canchas add column if not exists activa boolean default true;
alter table public.canchas enable row level security;

drop policy if exists "canchas lectura pública" on public.canchas;
create policy "canchas lectura pública"
  on public.canchas for select to anon, authenticated using (true);

drop policy if exists "canchas escritura sólo admin" on public.canchas;
create policy "canchas escritura sólo admin"
  on public.canchas for all to authenticated using (true) with check (true);

-- ─── articulos ─────────────────────────────────────────────────────────────
alter table public.articulos enable row level security;

drop policy if exists "articulos lectura pública" on public.articulos;
create policy "articulos lectura pública"
  on public.articulos for select to anon, authenticated using (true);

drop policy if exists "articulos escritura sólo admin" on public.articulos;
create policy "articulos escritura sólo admin"
  on public.articulos for all to authenticated using (true) with check (true);

-- ─── turnos_fijos ──────────────────────────────────────────────────────────
alter table public.turnos_fijos enable row level security;

drop policy if exists "turnos_fijos lectura pública" on public.turnos_fijos;
create policy "turnos_fijos lectura pública"
  on public.turnos_fijos for select to anon, authenticated using (true);

drop policy if exists "turnos_fijos escritura sólo admin" on public.turnos_fijos;
create policy "turnos_fijos escritura sólo admin"
  on public.turnos_fijos for all to authenticated using (true) with check (true);

-- ─── ventas_cantina ────────────────────────────────────────────────────────
alter table public.ventas_cantina enable row level security;
alter table public.ventas_cantina_detalle enable row level security;

drop policy if exists "ventas_cantina lectura pública" on public.ventas_cantina;
create policy "ventas_cantina lectura pública"
  on public.ventas_cantina for select to anon, authenticated using (true);

drop policy if exists "ventas_cantina insert sólo admin" on public.ventas_cantina;
create policy "ventas_cantina insert sólo admin"
  on public.ventas_cantina for insert to authenticated with check (true);

drop policy if exists "ventas_cantina_detalle lectura pública" on public.ventas_cantina_detalle;
create policy "ventas_cantina_detalle lectura pública"
  on public.ventas_cantina_detalle for select to anon, authenticated using (true);

drop policy if exists "ventas_cantina_detalle insert sólo admin" on public.ventas_cantina_detalle;
create policy "ventas_cantina_detalle insert sólo admin"
  on public.ventas_cantina_detalle for insert to authenticated with check (true);


-- ────────────────────────────────────────────────────────────────────────────
--  5) cierres_caja — Registro histórico y arqueo de cierres de caja (Cierre Z)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.cierres_caja (
  id                      uuid primary key default gen_random_uuid(),
  folio                   text not null,
  fecha                   date not null default current_date,
  hora_cierre             text not null,
  fecha_cierre            timestamptz not null default now(),
  periodo_desde           timestamptz,
  periodo_hasta           timestamptz not null default now(),
  total_general           integer not null default 0 check (total_general >= 0),
  total_canchas           integer not null default 0 check (total_canchas >= 0),
  total_cantina           integer not null default 0 check (total_cantina >= 0),
  total_cantina_mostrador integer not null default 0 check (total_cantina_mostrador >= 0),
  total_cantina_turnos    integer not null default 0 check (total_cantina_turnos >= 0),
  total_efectivo          integer not null default 0 check (total_efectivo >= 0),
  total_transferencia     integer not null default 0 check (total_transferencia >= 0),
  total_debito            integer not null default 0 check (total_debito >= 0),
  total_credito           integer not null default 0 check (total_credito >= 0),
  cantidad_turnos         integer not null default 0,
  cantidad_ventas_cantina integer not null default 0,
  observaciones           text,
  cerrado_por             text,
  creado_el               timestamptz not null default now()
);

create index if not exists cierres_caja_fecha_idx on public.cierres_caja (fecha);
create index if not exists cierres_caja_creado_el_idx on public.cierres_caja (creado_el);

alter table public.cierres_caja enable row level security;

drop policy if exists "cierres_caja lectura pública" on public.cierres_caja;
create policy "cierres_caja lectura pública"
  on public.cierres_caja for select to anon, authenticated using (true);

drop policy if exists "cierres_caja insert pública" on public.cierres_caja;
create policy "cierres_caja insert pública"
  on public.cierres_caja for insert to anon, authenticated with check (true);


-- ────────────────────────────────────────────────────────────────────────────
--  6) configuracion — Ajustes globales y tarifas del complejo
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.configuracion (
  id              integer primary key default 1,
  precio_base     integer not null default 15000,
  nombre_club     text,
  actualizado_el  timestamptz not null default now()
);

alter table public.configuracion enable row level security;

drop policy if exists "configuracion lectura pública" on public.configuracion;
create policy "configuracion lectura pública"
  on public.configuracion for select to anon, authenticated using (true);

drop policy if exists "configuracion escritura pública" on public.configuracion;
create policy "configuracion escritura pública"
  on public.configuracion for all to anon, authenticated using (true) with check (true);

insert into public.configuracion (id, precio_base)
values (1, 15000)
on conflict (id) do nothing;

