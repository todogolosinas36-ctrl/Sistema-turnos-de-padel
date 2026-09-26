# Sistema de Turnos de Pádel

Aplicación web para administrar las reservas de un complejo de pádel: vista de
reserva para el cliente y panel de administración con grilla diaria, cobro con
split payment, POS de cantina, abonos y cierre de caja.

---

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Variables de entorno

`.env` en la raíz:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxx
VITE_WHATSAPP_COMPLEJO=3811234567
VITE_NOMBRE_COMPLEJO="20/10"
```

> La clave anon viaja en el bundle del navegador: **no es un secreto**. Por eso
> las políticas RLS (paso 4) son las que realmente protegen los datos.

### 3. Esquema de la base — ** paso obligatorio **

Abrí **Supabase Dashboard → SQL Editor → New query**, pegá el contenido de
[`supabase/schema.sql`](./supabase/schema.sql) y ejecutalo.

Crea las tablas `turnos_fijos`, `ventas_cantina` y `ventas_cantina_detalle`,
agrega a `turnos` las columnas de cobro, y aplica las políticas RLS.

El archivo es **idempotente**: se puede correr las veces que quieras.

> ¿No lo corriste? La app no se rompe: cae en "modo local" y te muestra un
> banner ámbar arriba indicando qué falta. Pero los turnos **no** se guardan en
> la base, así que no se ven desde otros dispositivos.
### 4. Usuario administrador

**Authentication → Users → Add user → Create new user**

- Email: el que quieras
- Password: la que quieras (mínimo 6 caracteres)
- ☑ **Auto Confirm User** (si no, queda esperando confirmación)

Esas credenciales son las de `/admin/login`.

### 5. Correr

```bash
npm run dev
```

- Cliente: <http://localhost:5173/>
- Panel: <http://localhost:5173/admin>

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build |
| `npm run lint` | ESLint (debe salir sin errores) |

---

## Cómo funcionan los datos

### Fuente de verdad

Los turnos, abonos, canchas, artículos y ventas viven en **Supabase**. La
configuración de la interfaz (nombre del club, color, tema, tarifa base, franja
de mañana) vive en `localStorage` porque son preferencias de cada dispositivo.

Si Supabase no responde, la app **no se rompe**: entra en "modo local" y sigue
funcionando contra `localStorage`, con un banner avisando. Sirve para trabajar
sin conexión, pero los datos no se comparten.

### Flujo de un turno

1. El cliente reserva desde `/` → `INSERT` en `turnos` con un
   `token_cancelacion` (UUID).
2. Se le da un link de WhatsApp con ese token para poder_self-cancelar.
3. El cajero marca el turno como pagado desde la grilla → se actualizan
   `estado`, `precio` (el total real cobrado), `total_base_cancha`,
   `gastos_compartidos` y `detalle_cobro` (el split por jugador).
4. La Caja Diaria lee los turnos pagados y las ventas de cantina del día.

### Abonos (turnos fijos)

Un abono es una reserva recurrente semanal. **No se persiste como turno**: se
materializa en memoria cada vez que se pide un día (`obtenerTurnosDelDia`), con
un id sintético `fijo::<uuid-abono>::<fecha>`.

Cuando cobrás un abono, ese id **se materializa en un turno real** en la tabla
`turnos`, que queda linked al abono vía `turno_fijo_id`. A partir de ahí es un
turno normal (se puede cobrar, reimprimir, auditar).

> El separador es `::` y no `-` a propósito: los UUID de Supabase contienen
> guiones y un `split('-')` rompía el id.

### Días de la semana

La lista de días arranca en **lunes** (no en domingo como `getDay()`), por eso el
índice se corre con `(getDay() + 6) % 7`.

### Fechas

Todas las fechas se construyen con **hora local** (`aISO` / `hoyISO` en
`src/utils/dateHelpers.js`). No uses `toISOString()` para obtener "hoy": en
Argentina (UTC-3) después de las 21:00 devuelve el día siguiente, que es
justamente la hora de cerrar la caja.

---

## Estructura

```
src/
  App.jsx                 rutas (admin con lazy loading)
  context/
    TurnosContext.jsx     ← fuente de verdad de turnos/abonos/canchas
    ArticulosContext.jsx  ← inventario del kiosco
    AuthContext.jsx       ← sesión de Supabase
    ThemeContext.jsx      ← tema del panel
  lib/
    supabaseClient.js
    erroresSupabase.js    ← traduce errores a mensajes accionables
  layouts/                ClientLayout (mobile) · AdminLayout (sidebar/drawer)
  pages/
    client/Home.jsx       reserva self-service
    admin/                Dashboard · AgendaDiaria · Articulos · Cantina ·
                          TurnosFijos · CajaDiaria · Configuracion · Login
  components/             ReservaModal · ModalCobro · CancelacionView · …
supabase/
  schema.sql              ← ejecutarlo en el SQL Editor
  setup-admin-auth.sql    usuario admin + RLS (opcional, defensa en profundidad)
```

---

## Notas de seguridad

- `/admin` está protegido con Supabase Auth (ver `RequireAuth`). Sin sesión,
  redirige a `/admin/login`.
- La cancelación por token (`/?token=...`) es **pública a propósito**: el cliente
  se autocancela sin cuenta. La política RLS de `turnos` deja el `UPDATE`
  anónimo abierto por eso. Si querés cerrarla, hay que mover el flujo a una
  Supabase Edge Function.
- El resto de las escrituras (`INSERT`/`UPDATE`/`DELETE`) están restringidas a
  usuarios autenticados por RLS.
