# Módulo `gym/` — backend de GymBro

Módulo NestJS independiente dentro del backend compartido de portfolio
(`portfolio-app/backend`), mismo patrón que `tienda-mueble/`: submódulos
propios (auth, users, centers, etc.) dentro de esta carpeta, compartiendo
solo infraestructura genérica (`EmailModule`, conexión a Mongo) con el resto
de las apps. El modelo de datos completo, las decisiones de producto y el
roadmap por fases están en
[`gymbro/PLANNING.md`](../../../../gymbro/PLANNING.md) — este README
documenta solo lo que ya existe en código: variables de entorno, endpoints y
las decisiones de diseño que no son obvias leyendo los archivos sueltos.

Para probarlo de punta a punta contra tu Mongo local, ver
[`gymbro/TESTING_LOCAL.md`](../../../../gymbro/TESTING_LOCAL.md).

## Estado (2026-09-07)

Fases 1, 2 y 3 del roadmap completas — todo el backend de GymBro:
`auth`, `users`, `centers`, `memberships`, `announcements`, `checkins`,
`dashboard`, `payments` (Stripe + Mercado Pago, con vencimiento automático
de membresías enganchado en `checkins`/`dashboard`), `classes` (reserva de
clases con cupo + lista de espera con promoción automática) y
`notifications` (push vía Web Push/VAPID + email, para avisos de lista de
espera y para publicar anuncios). El frontend PWA del socio también está
completo.

Además, ya para soportar el panel de administración (Fase 4 del roadmap del
frontend, ver `gymbro/PLANNING.md` sección 5), se sumaron tres endpoints que
antes no existían: CRUD completo de sedes (`gym/centers`, antes solo
lectura con 3 centros hardcodeados), listado/búsqueda de socios y ficha
individual (`gym/users`, antes solo existía el alta manual), y gestión de
roles de admin (`gym/users/:id/role`, antes había que promover un admin a
mano en Mongo). El panel admin del frontend (`gymbro/frontend/src/pages/admin/`)
ya consume los tres.

**Extras post-cierre (2026-09-07)**: pago manual desde la ficha del socio
(`POST /gym/payments/users/:userId/manual`, gateado por un flag de negocio
`GymPaymentSettings.allowAdminManualPayments` que solo un superadmin puede
tocar) y límite de un cambio de plan por mes calendario en el autoservicio
del socio (`GymUser.lastPlanChangeAt`) — ver el detalle en la sección
`gym/payments` más abajo. Antes de esto, "cobrar a mano" (mencionado arriba)
significaba literalmente fuera del sistema; ahora queda registrado como
cualquier otro pago.

**Extras post-cierre, ronda 2 (2026-09-07)**: la vuelta del checkout de
Stripe/Mercado Pago apuntaba a una página que no existía en el frontend
(`/membresia/pago-confirmado`, 404) — se agregó `GET
/gym/payments/receipt/:paymentId` y `payment_id` en las URLs de vuelta de
ambos proveedores para que el frontend pueda mostrar un comprobante (con
descarga a PDF vía impresión del navegador). Además, el pago manual ahora
registra qué admin lo cobró (`GymPayment.processedByUserId`) y le avisa por
mail a todos los superadmins — ver el detalle en la sección `gym/payments`.

**Fix real, ronda 3 (2026-09-08)**: los webhooks de Stripe/Mercado Pago
devolvían `401` siempre (reportado por Mariano probando un pago real de
Stripe en local — el historial quedaba en "Pendiente" para siempre).
Causa: `GymPaymentsController` tenía `@UseGuards(JwtAuthGuard, RolesGuard)`
a nivel de clase, que se aplicaba también a los dos webhooks (no hay
`@Public()`/bypass por reflector en este proyecto para excluir una ruta de
un guard de clase). Se movieron los guards a nivel de endpoint (mismo
patrón que `tienda-mueble/orders/orders.controller.ts`), dejando los
webhooks genuinamente sin guards. Ver el detalle de la causa y cómo
verificarlo en
[`gymbro/TESTING_LOCAL.md`, sección 23](../../../../gymbro/TESTING_LOCAL.md#23-fix-los-webhooks-de-stripemercado-pago-devolvían-401-2026-09-08).

**Extras post-cierre, ronda 4 (2026-09-08)**: a partir de una pregunta de
Mariano tras probar el fix de los webhooks (¿se bloquea un recobro del mismo
plan activo? ¿el vencimiento se refleja solo?), se cerraron dos huecos
reales: `resolvePlanForCheckout` ahora rechaza con `400` un checkout para el
mismo plan que ya está `active` y vigente (antes solo el frontend ocultaba
el botón, sin respaldo del lado del servidor); y `GET /gym/users/me` ahora
también dispara el chequeo perezoso de vencimiento (antes solo se
recalculaba en check-in/reserva de clase/dashboard admin, así que un socio
que no interactuaba con esas partes podía seguir viendo "Activa" días
después de vencido). Ver el detalle en
[`gymbro/TESTING_LOCAL.md`, sección 24](../../../../gymbro/TESTING_LOCAL.md#24-no-recobrar-el-mismo-plan-activo--vencimiento-visible-sin-check-in-2026-09-08).

**Ronda 5 — roles intermedios, autoservicio y contenido (2026-09-08)**: se
cerró todo el backlog que Mariano había aprobado salvo la integración con
hardware de molinete (sin fecha, ver `PLANNING.md` sección 5). En una sola
tanda:

- Rol `recepcion` (`GYM_ROLES`, ver "Autenticación y roles" abajo) — acceso
  acotado a `gym/checkins` (escaneo QR/manual) y a `GET /gym/users` para
  buscar un socio, sin ficha completa ni resto del panel.
- Congelamiento de membresía self-service, en semanas (`POST
  /gym/memberships/me/freeze`, 1 a 3 semanas) — antes solo lo cambiaba un
  admin a mano.
- `GET /gym/memberships/plans/all` — planes inactivos incluidos, resuelve la
  limitación que tenía "Gestión de planes" (ver más abajo, ya no aplica).
- Recordatorio de vencimiento próximo: aviso visual en la PWA (Home y "Mi
  membresía") y `POST /gym/reminders/expiring-soon`, disparado por una
  GitHub Action diaria, para el email — mismo umbral (`EXPIRING_SOON_DAYS`,
  7 días) en los tres lugares.
- `googleMapsUrl` en `GymCenter` y `POST /gym/centers/:id/photo` (agrega al
  array `photos`), `POST /gym/classes/:id/photo` (reemplaza `imageUrl`) —
  mismo patrón de endpoint aparte que `gym/users/me/photo`.
- Sistema de referidos/invite-link: `centerId`/`ref` opcionales en
  `POST /gym/auth/register` y `POST /gym/auth/google`, generados desde el
  botón "Compartir" de "Gestión de sedes" (`/registro?centerId=...&ref=...`).

## Variables de entorno

Además de las compartidas por todo el backend (`MONGODB_URI`,
`RESEND_API_KEY`, `FRONTEND_URL` para CORS), este módulo usa (ver
`.env.example`, sección "GymBro"):

| Variable | Descripción |
|---|---|
| `GYM_JWT_SECRET` | Secret para firmar los JWT propios de GymBro (7 días de vida). Distinto del de `tienda-mueble` — cada app tiene el suyo. |
| `GYM_GOOGLE_CLIENT_ID` | Client ID de un proyecto OAuth de Google propio de GymBro (no se reutiliza el de otras apps). |
| `GYM_FRONTEND_URL` | Origen único (sin coma ni slash final) del frontend de GymBro, usado para armar links absolutos en los emails (invitación, bienvenida). No confundir con `FRONTEND_URL` (lista de orígenes CORS). |
| `GYM_APPLE_AUTH_ENABLED` | Reservado, todavía sin uso — Mariano no tiene cuenta de Apple Developer. Con el flag ausente/`false`, el frontend debe ocultar el botón de Apple. |
| `GYM_STRIPE_ENABLED`, `GYM_STRIPE_SECRET_KEY`, `GYM_STRIPE_WEBHOOK_SECRET` | Activan Stripe como medio de pago. A diferencia de `tienda-mueble`, acá hace falta el flag `ENABLED` explícito además de las credenciales (`GymStripeService.isConfigured` exige los dos) — GymBro puede operar sin ningún proveedor activo mientras Mariano cobra las cuotas a mano. Proyecto/dashboard de Stripe propio, separado del de `tienda-mueble`. |
| `GYM_MERCADOPAGO_ENABLED`, `GYM_MERCADOPAGO_ACCESS_TOKEN`, `GYM_MERCADOPAGO_WEBHOOK_SECRET` | Idem para Mercado Pago. A diferencia de `tienda-mueble` (que cobra en ARS con una tasa fija), GymBro cobra en EUR directo — es un gimnasio físico en Valencia, no tiene sentido convertir. |
| `GYM_VAPID_PUBLIC_KEY`, `GYM_VAPID_PRIVATE_KEY`, `GYM_VAPID_SUBJECT` | Par de claves VAPID para Web Push. A diferencia de Stripe/Mercado Pago no hay flag `*_ENABLED` separado — alcanza con que estén las dos claves (`GymWebPushService.isConfigured`). Sin ellas, GymBro sigue funcionando igual (clases, lista de espera, anuncios) pero solo por email, el push simplemente no se dispara. Generar un par propio con `npx web-push generate-vapid-keys` — no reutilizar el mismo par entre entornos/proyectos. |
| `GYM_CRON_SECRET` | Secreto compartido para `POST /gym/reminders/expiring-soon` (header `x-cron-secret`), disparado por la GitHub Action diaria de recordatorios de vencimiento. Sin esta env var configurada, el endpoint queda cerrado por completo. En producción tiene que coincidir con el secret `GYM_CRON_SECRET` del repo en GitHub (Settings → Secrets → Actions). |

Sin `RESEND_API_KEY` configurada, los emails (invitación, bienvenida) no se
envían de verdad — se loguean en consola (`[DEV] ...`), pensado para
desarrollo local sin cuenta de Resend.

## Autenticación y roles

Cuatro roles (`GymUser.role`, `GYM_ROLES`): `member`, `admin`, `superadmin`,
`recepcion`.

- **`member`**: acceso a su propio perfil y a lectura general (centros,
  planes, anuncios). No puede administrar nada de otros socios.
- **`admin`**: gestiona una o varias sedes concretas, listadas en
  `managedCenterIds`. Todo lo que un admin lee o escribe que dependa de un
  centro (planes, cambios de estado de membresía, check-ins, métricas del
  dashboard) se valida contra esa lista — ver "Scoping por centro" abajo.
- **`superadmin`**: sin restricción de centro, ve y gestiona todo. Es el
  único rol que puede crear otros admins o cambiarles los centros
  asignados, vía `PATCH /gym/users/:id/role` (ver más abajo).
- **`recepcion`** (2026-09-08): rol intermedio acotado exclusivamente a
  "Control de acceso" — `gym/checkins` (escaneo QR y check-in manual) y
  `GET /gym/users` (buscar un socio para el check-in manual). Sin acceso a
  la ficha completa de un socio (`GET /gym/users/:id`), pagos, planes, ni el
  resto del panel admin. A efectos de scoping por centro se comporta como
  `admin` (`assertCenterAccess` lo trata igual, requiere `managedCenterIds`)
  pero con muchos menos permisos — ver `@Roles(...)` de cada controller para
  el detalle de qué rutas lo incluyen.

A diferencia del auth stateless de `tienda-mueble` (un único admin
hardcodeado por email, sin tabla de usuarios), acá el JWT solo lleva el
`userId` — `JwtAuthGuard` busca el `GymUser` fresco en Mongo en cada
request. Es a propósito: si un `superadmin` le cambia el rol o los centros a
un `admin`, o si un socio queda `isActive: false`, el efecto es inmediato,
sin esperar a que expire un token viejo.

### Scoping por centro: `assertCenterAccess`

No existe un guard genérico de "centro" (a diferencia de `RolesGuard`, que
sí es un guard porque el rol siempre está en el mismo lugar). El motivo:
cada endpoint recibe el `centerId` relevante de un lugar distinto — un
param de URL (`checkins/scan`), un campo del body (`centerIds` al crear un
plan), o un campo de un documento ya cargado de Mongo (`member.centerId` al
cambiar el estado de una membresía). Forzar un guard genérico a adivinar de
dónde sacarlo hubiera sido más complejo que el problema que resuelve.

En su lugar, cada service llama a mano a
`assertCenterAccess(user, centerId)` (`auth/centers-access.util.ts`):
`superadmin` siempre pasa, `admin` necesita tener ese `centerId` en su
`managedCenterIds`, cualquier otro caso tira `403 Forbidden`.

## Endpoints

`Auth` en la tabla significa `JwtAuthGuard` (sesión válida). `Rol` es lo que
exige `@Roles(...)` además de la sesión — vacío significa "cualquier socio
autenticado".

### `gym/auth` — sin sesión, con rate limit (5 req / 10 min por IP)

| Método y ruta | Descripción |
|---|---|
| `POST /gym/auth/register` | Autoregistro con email + contraseña. Dispara el mail de bienvenida. Acepta `centerId`/`ref` opcionales (2026-09-08) — ver "Sistema de referidos / invite-link" más abajo. |
| `POST /gym/auth/login` | Login con email + contraseña. |
| `POST /gym/auth/google` | Login/autoregistro con ID token de Google. Dispara el mail de bienvenida solo la primera vez que se crea la cuenta. Acepta los mismos `centerId`/`ref` opcionales, solo se usan si termina creando una cuenta nueva. |
| `POST /gym/auth/accept-invite` | Completa el acceso de un socio dado de alta manualmente por un admin (fija contraseña con el `inviteToken` del mail de invitación). |

**Sistema de referidos / invite-link** (2026-09-08): `AdminSedesPage`
("Gestión de sedes", superadmin) tiene un botón "Compartir" por sede que
copia `${GYM_FRONTEND_URL}/registro?centerId=<id>&ref=<userId del que
comparte>`. `RegisterPage` lee esos dos query params y los manda tal cual en
el body de `register`/`google`. `GymAuthService.resolveCenterId` valida que
el centro exista (si no, lo ignora silenciosamente, no rechaza el
registro); `resolveReferrer` hace lo mismo con el `userId` — un link roto o
viejo nunca bloquea el alta, en el peor caso el socio nuevo simplemente
queda sin `centerId`/`referredByUserId` precargado. Pensado como link de
invitación general: hoy solo lo genera un superadmin desde "Gestión de
sedes", pero el backend no exige que quien comparte sea admin.

### `gym/users` — Auth

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/users/me` | — | Perfil propio. |
| `PATCH /gym/users/me` | — | Editar perfil propio (nombre, foto, `birthDate`, teléfono, contacto de emergencia, altura, objetivo). No incluye rol/membresía/centro — eso lo maneja un admin. |
| `GET /gym/users/me/weight-logs` | — | Historial de peso propio. |
| `POST /gym/users/me/weight-logs` | — | Cargar un peso nuevo (actualiza también `currentWeight` denormalizado). |
| `POST /gym/users/me/qr-code/regenerate` | — | Regenerar el `qrCodeToken` del carnet digital. |
| `GET /gym/users` | `admin`, `superadmin`, `recepcion` | Listado/búsqueda de socios para "Gestión de afiliados" (`search`, `centerId`, `status` opcionales por query). Un `admin`/`recepcion` solo ve socios de sus `managedCenterIds`; `superadmin` ve todos. `recepcion` lo usa la pestaña "Buscar" de "Control de acceso" para encontrar un socio y hacer el check-in manual, sin acceso a `GET /gym/users/:id` (ficha completa), que sigue vedado para este rol. |
| `GET /gym/users/admins` | `superadmin` | Listado de usuarios con rol `admin` (para "Gestión de admins"). Ruta declarada antes de `:id` para que Nest no la matchee como un ObjectId. |
| `GET /gym/users/:id` | `admin`, `superadmin` | Ficha individual de un socio (o admin), mismo scoping por centro que el listado. |
| `POST /gym/users` | `admin`, `superadmin` | Alta manual de un socio nuevo. Genera su `qrCodeToken` de entrada y dispara mail de invitación. Si quien pide el alta es `superadmin`, también acepta `role`/`managedCenterIds` en el body para dar de alta un admin nuevo con el mismo flujo de invitación (el service rechaza esos campos si no es `superadmin`). |
| `PATCH /gym/users/:id/role` | `superadmin` | Promueve un `member` a `admin`, degrada un `admin` a `member`, o reasigna los centros de un admin existente (`managedCenterIds`, obligatorio con al menos 1 centro cuando `role = admin`). |

### `gym/centers` — Auth

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/centers` | — | Listado de sedes activas (lo que ve un socio). |
| `GET /gym/centers/all` | `superadmin` | Todas las sedes, incluidas las desactivadas (panel "Gestión de sedes"). Ruta declarada antes de `:id`, mismo criterio que `gym/users/admins`. |
| `GET /gym/centers/:id` | — | Una sede puntual. |
| `POST /gym/centers` | `superadmin` | Crear sede. |
| `PATCH /gym/centers/:id` | `superadmin` | Editar sede (incluye reactivar/desactivar vía `isActive` — soft-delete, no hay `DELETE`; incluye también `googleMapsUrl`, ver abajo). |
| `POST /gym/centers/:id/photo` | `superadmin` | Sube una foto y la agrega al array `photos` de la sede (no reemplaza las anteriores, ver `GymCentersService.addPhoto`) — mismo límite de tamaño (5MB) y patrón multipart que `gym/users/me/photo`. |

Para el arranque (Fase 1-3) hubo 3 sedes hardcodeadas, cargadas con
`npm run seed:gym-centers` (script idempotente, ver nota técnica más abajo);
con el CRUD ya en pie, la gestión de sedes se hace desde el panel admin.

**`googleMapsUrl`** (2026-09-08, campo opcional de `GymCenter`): link
directo a la ubicación de la sede en Google Maps, cargado a mano por el
superadmin al crear/editar (no se resuelve ni valida contra la API de Maps,
es un string libre). El frontend lo muestra como "Cómo llegar" tanto en el
Home del socio como en la ficha de la sede — si no está cargado, simplemente
no aparece el link.

### `gym/memberships` — Auth

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/memberships/plans` | — | Planes activos (cualquier socio los ve para elegir/comparar). |
| `GET /gym/memberships/plans/all` | `admin`, `superadmin` | Todos los planes, incluidos los desactivados (2026-09-08) — ver "Planes inactivos" abajo. Va antes de `plans/:id` para que Nest no la matchee como un ObjectId, mismo criterio que `gym/users/admins`. |
| `GET /gym/memberships/plans/:id` | — | Un plan puntual. |
| `POST /gym/memberships/plans` | `admin`, `superadmin` | Crear plan. Un `admin` está obligado a acotar `centerIds` a (alguno de) sus propios centros; `superadmin` puede dejarlo vacío = plan global. |
| `PATCH /gym/memberships/plans/:id` | `admin`, `superadmin` | Editar plan. Un `admin` solo puede tocar planes ya acotados a sus centros. |
| `PATCH /gym/memberships/users/:userId/status` | `admin`, `superadmin` | Cambiar el `membershipStatus` de un socio a mano. Cada cambio queda auditado en `GymMembershipEvent` (con `category`: alta/baja_voluntaria/baja_impago/congelamiento/reactivacion/otro) — eso alimenta las métricas de altas/bajas del dashboard. No toca `membershipStartDate`/`EndDate` — esas fechas las maneja `gym/payments` (ver más abajo) cuando el socio paga; este endpoint es solo para cambios de estado manuales (congelar, dar de baja, etc.) sin pago de por medio. |
| `POST /gym/memberships/me/freeze` | — | Congelamiento self-service de la PROPIA membresía (2026-09-08) — ver "Congelamiento self-service" abajo. Sin `@Roles`: cualquier socio autenticado, no hace falta ser admin. |

**Planes inactivos** (`GET /gym/memberships/plans/all`, resuelve una
limitación documentada hasta el 2026-09-07): antes, "Gestión de planes"
usaba el mismo endpoint que el socio para elegir plan (`GET
/gym/memberships/plans`), que solo devuelve activos — un plan desactivado
desaparecía de la lista sin forma de reactivarlo por UI. `AdminPlanesPage`
ahora consume `plans/all` y muestra los desactivados con su propio estado,
permitiendo reactivarlos vía el `PATCH` existente.

**Congelamiento self-service** (`freezeOwnMembership`, `FreezeGymMembershipDto`,
2026-09-08): acotado a 1, 2 o 3 semanas (`@IsIn([1, 2, 3])`) — más que eso
empieza a pisar el criterio de "de baja" y se maneja mejor a mano por un
admin vía `PATCH /gym/memberships/users/:userId/status`. Requiere que la
membresía esté `active` (antes de chequear, corre
`reactivateFrozenMembershipIfNeeded` por si un congelamiento previo ya
venció). Extiende `membershipEndDate` por la misma cantidad de semanas que
dura el congelamiento (así el socio no pierde días pagos) y guarda
`freezeEndsAt` para saber cuándo reactivar. Queda auditado en
`GymMembershipEvent` con `category: 'congelamiento'`, igual que un
congelamiento hecho a mano por un admin.

### `gym/announcements` — Auth

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/announcements` | — | Anuncios/promos publicados y no vencidos (lo que ve un socio). |
| `GET /gym/announcements/all` | `admin`, `superadmin` | Todos, incluyendo futuros/vencidos (panel admin). |
| `GET /gym/announcements/:id` | — | Un anuncio puntual. |
| `POST /gym/announcements` | `admin`, `superadmin` | Crear. `notifyPush`/`notifyEmail` quedan siempre en `false` al crear — el envío real de esos canales es una acción separada, ver `POST /gym/notifications/announcements/:id/publish` más abajo. |
| `PATCH /gym/announcements/:id` | `admin`, `superadmin` | Editar. |
| `DELETE /gym/announcements/:id` | `admin`, `superadmin` | Borrar (`204`). |

### `gym/checkins` — Auth, `admin`/`superadmin`/`recepcion` en todo el controller

| Método y ruta | Descripción |
|---|---|
| `POST /gym/checkins/scan` | Registra un acceso a partir del `qrCodeToken` escaneado. |
| `POST /gym/checkins/manual` | Registra un acceso cargando el `userId` a mano (sin QR). |

Ambos devuelven `accessGranted` según el `membershipStatus` del socio **en
ese momento** — se guarda como snapshot (`membershipStatusAtCheckIn`) y
nunca se recalcula retroactivamente, para que el historial de accesos no
cambie si el socio paga o vence más tarde.

### `gym/dashboard` — Auth, `admin`/`superadmin`

| Método y ruta | Descripción |
|---|---|
| `GET /gym/dashboard/metrics` | Métricas para el panel admin. Query params opcionales: `centerId` (acota a un solo centro, valida acceso), `month` (`YYYY-MM`, para altas/bajas — default mes actual), `periodDays` (ventana de la métrica de frecuencia de visitas — default 30). |

Sin `centerId`, un `admin` ve la suma de sus propios `managedCenterIds` y un
`superadmin` ve todos los centros juntos (`centerIds: "all"` en la
respuesta). Devuelve: conteo de socios por `membershipStatus`, reparto por
franjas etarias (solo cuenta socios con `birthDate` cargada), frecuencia de
visitas (check-ins totales, visitantes únicos, promedio por socio activo en
el período), y altas/bajas del mes por `category` (distinguiendo
`baja_voluntaria` de `baja_impago`). `GymMembershipEvent` no tiene `centerId`
propio, así que al filtrar por centro el service primero resuelve qué
socios pertenecen a ese centro y después filtra los eventos por esos
`userId` — no es una limitación del endpoint, es cómo está modelada la
auditoría (ver `PLANNING.md` sección 2.9).

### `gym/payments` — Auth (Fase 2)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/payments/config` | — | Qué proveedores están activos (`stripeEnabled`/`mercadopagoEnabled`), para que el frontend sepa qué botones de pago mostrar sin adivinar a partir de un `400`. |
| `POST /gym/payments/checkout-session/stripe` | — | Crea un `GymPayment` `pending` + una Checkout Session de Stripe, devuelve la `url` a la que el frontend redirige. `400` si Stripe no está configurado. |
| `POST /gym/payments/checkout-session/mercadopago` | — | Idem contra Mercado Pago (Checkout Pro) — devuelve la `url` del `init_point`. |
| `GET /gym/payments/me` | — | Historial de pagos propio. |
| `GET /gym/payments/receipt/:paymentId` | — | Comprobante de un pago puntual del propio socio (2026-09-07) — lo usa `PagoConfirmadoPage` tras volver del checkout, ver más abajo. `404` si el pago no existe o no es del usuario logueado. |
| `GET /gym/payments/users/:userId` | `admin`, `superadmin` | Historial de pagos de un socio puntual (ficha de "Gestión de afiliados"), scoping por centro vía `assertCenterAccess`. |
| `POST /gym/payments/users/:userId/manual` | `admin`, `superadmin` | Registra un pago en efectivo/transferencia y lo marca `paid` al instante (sin depender de Stripe/Mercado Pago) — ver "Pago manual" más abajo. |
| `GET /gym/payments/settings` | `admin`, `superadmin` | Lee `allowAdminManualPayments` (si los `admin` comunes pueden usar el endpoint anterior). |
| `PATCH /gym/payments/settings` | `superadmin` | Cambia `allowAdminManualPayments`. |
| `POST /gym/payments/webhook/stripe` | público (sin `JwtAuthGuard`) | Lo llama Stripe. Verifica la firma contra el body crudo (`rawBody: true`, ver `main.ts`) — mismo patrón que `tienda-mueble/orders`. |
| `POST /gym/payments/webhook/mercadopago` | público (sin `JwtAuthGuard`) | Lo llama Mercado Pago. La firma se calcula sobre `id`/`ts`, no sobre el body — no necesita `rawBody`. |

**Flujo de confirmación** (`GymPaymentsService.markPaymentPaid`, disparado
desde los dos webhooks): idempotente — un pago ya `paid` no se vuelve a
procesar, así que reintentos de webhook (algo normal en los dos proveedores)
no duplican la extensión de membresía ni el mail. Antes de extender, corre
`expireMembershipIfNeeded` por si la membresía ya había vencido sin que nadie
lo notara, para que la auditoría (`GymMembershipEvent`) quede como
"reactivación" y no como un alta de la nada. La fecha de fin de período se
calcula sumando el `billingCycle` del plan (`mensual`/`trimestral`/`anual`)
a la fecha de pago. Una renovación mientras la membresía seguía activa no
genera un evento de auditoría nuevo (no es un cambio de estado real, para no
ensuciar las métricas de altas/bajas del dashboard con renovaciones
normales).

**Comprobante + `payment_id` en la vuelta del checkout** (2026-09-07): tanto
`GymStripeService.createCheckoutSession` (`success_url`) como
`GymMercadoPagoService.createPreference` (`back_urls.success`/`pending`)
mandan `?payment_id=<GymPayment._id>` en la URL de vuelta — antes solo
Stripe mandaba su propio `session_id`, que no sirve para consultar el pago
contra nuestro backend (es un id de Stripe, no el `_id` de Mongo) y Mercado
Pago no mandaba nada propio salvo lo que agrega solo
(`external_reference`, `status`, etc.). Con `payment_id` unificado, el
frontend tiene una única forma de buscar el pago sin parsear nada
específico de cada proveedor: `GET /gym/payments/receipt/:paymentId`
(`getReceiptForMember`, scoped al socio dueño del pago). `PagoConfirmadoPage`
(frontend) hace polling corto sobre este endpoint hasta que el `status` deja
de ser `pending` — el webhook puede tardar unos segundos más que el
redirect del navegador.

**Pago manual** (`recordManualPayment`, 2026-09-07): pensado para socios
sin Stripe/Mercado Pago configurados (como en local, ver
`TESTING_LOCAL.md`) o que simplemente pagan en persona. Crea el `GymPayment`
con `provider: 'manual'` (ya contemplado en `GYM_PAYMENT_METHODS` desde el
schema original) y llama a `markPaymentPaid` directo — mismo efecto que un
webhook confirmado (extiende membresía, audita, manda el mail), pero sin
esperar a un proveedor externo. Un `admin` (no superadmin) necesita que
`GymPaymentSettings.allowAdminManualPayments` esté en `true` (lo controla un
superadmin vía `PATCH /gym/payments/settings` — algunos gimnasios no quieren
que la recepción maneje efectivo); superadmin nunca está restringido. El
`amount` es opcional en el body — si no se manda se usa `plan.price` tal
cual. `GymPaymentSettings` es una colección singleton (un solo documento,
get-or-create) — no hay UI de alta, solo lectura/escritura del único
registro.

**Quién cobró el pago manual + aviso a superadmins** (`processedByUserId`,
2026-09-07): `recordManualPayment` guarda el `_id` del admin/superadmin
logueado que registra el cobro en `GymPayment.processedByUserId` — se
popula junto con `membershipPlanId` en cualquier lugar donde se devuelve un
`GymPaymentSummary` (`listPaymentsForMember`, `listPaymentsForAdmin`,
`getReceiptForMember`), y el frontend lo muestra como "Cobrado por X" en el
historial de pagos de la ficha del socio (`AdminAfiliadoDetallePage`). El
socio ya recibía su propio mail de confirmación vía `markPaymentPaid` (sin
cambios ahí); lo nuevo es que si `provider === 'manual'`,
`notifySuperadminsOfManualPayment` además le manda un mail
(`EmailService.sendGymManualPaymentRecordedEmail`) a *todos* los usuarios
con `role: 'superadmin'` — se resuelven dinámicamente con
`userModel.find({ role: 'superadmin' })` en vez de depender de un env var
tipo `GYM_SUPERADMIN_EMAIL`, para no tener que tocar código si el gimnasio
suma otro superadmin. No aplica a pagos Stripe/Mercado Pago (ahí paga el
propio socio, no tiene sentido "quién lo cobró").

**Límite de cambio de plan** (`GymUser.lastPlanChangeAt`, 2026-09-07): un
socio solo puede cambiar a un plan *distinto* del que ya tenía una vez por
mes calendario — pagar de nuevo el mismo plan (renovación normal) nunca
cuenta como cambio y está permitido en cualquier momento. Se valida
únicamente en el autoservicio del socio (`resolvePlanForCheckout`, llamado
por los dos `checkout-session/*`); `recordManualPayment` no pasa por ahí, así
que un admin puede cambiarle el plan a un socio sin esta restricción.
`lastPlanChangeAt` se actualiza dentro de `markPaymentPaid` cualquiera sea
quien pagó, apenas el plan efectivamente cambia (había uno previo y es
distinto del nuevo) — así el límite queda correcto también si, por ejemplo,
un admin le cambia el plan a mitad de mes.

**Vencimiento automático** (`common/membership-expiration.util.ts`): en vez
de un cron job (no hay `@nestjs/schedule` en el proyecto, y el backend
compartido en Render se duerme sin tráfico), se recalcula de forma perezosa
en los dos lugares donde importa que el dato esté al día — `GymCheckInsService`
antes de decidir `accessGranted`, y `GymDashboardService` antes de contar
socios por estado (`sweepExpiredMemberships`, en lote). `frozen`/`cancelled`
no vencen por esta vía — requieren una acción explícita de un admin.

### `gym/classes` — Auth (Fase 3)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/classes` | — | Clases activas. Query opcional `centerId`. |
| `GET /gym/classes/all` | `admin`, `superadmin` | Todas (incluye inactivas), scoping por centro igual que `memberships/plans`. |
| `GET /gym/classes/bookings/mine` | — | Reservas propias (excluye canceladas). |
| `GET /gym/classes/:id` | — | Una clase puntual. |
| `GET /gym/classes/:id/availability` | — | Cupo de un turno puntual. Query requerido `sessionDate`. Devuelve `bookedCount`/`waitlistCount`/`spotsAvailable`. |
| `GET /gym/classes/:id/roster` | `admin`, `superadmin` | Lista de asistentes/lista de espera de un turno puntual (para recepción). Query requerido `sessionDate`. |
| `POST /gym/classes` | `admin`, `superadmin` | Crear clase. |
| `PATCH /gym/classes/:id` | `admin`, `superadmin` | Editar. No se puede cambiar `centerId` — mover una clase de sede es lo bastante disruptivo como para tratarlo como borrar + crear, no como un update silencioso. |
| `POST /gym/classes/:id/photo` | `admin`, `superadmin` | Sube/reemplaza la imagen ilustrativa de la clase (`imageUrl`, 2026-09-08) — mismo límite de tamaño (5MB) y patrón de endpoint aparte (multipart) que `gym/users/me/photo`, ver `GymClassesService.updateClassImage`. |
| `DELETE /gym/classes/:id` | `admin`, `superadmin` | Borrar. Cancela en cascada todas las reservas futuras (`booked`/`waitlisted`) antes de borrar, para no dejar reservas huérfanas. |
| `POST /gym/classes/bookings` | — | Reservar un turno. Requiere membresía `active` (chequeo perezoso de vencimiento, igual que check-ins/dashboard/pagos), respeta `requiresPlanFeature` (`'pool'`→`plan.includesPool`, `'spa'`→`plan.includesSpa`) y `classCreditsPerMonth` del plan (`null` = ilimitado, si no cuenta las reservas `booked`/`attended` del socio en el mes de `sessionDate`). Si `bookedCount < capacity` la reserva queda `booked`, si no `waitlisted`. |
| `POST /gym/classes/bookings/:bookingId/cancel` | — | Cancelar reserva propia (un `admin`/`superadmin` también puede cancelar ajenas, con `assertCenterAccess`). Si la reserva cancelada era `booked` (liberaba un cupo real), promueve automáticamente al primero de la lista de espera (`waitlisted` más antiguo) a `booked` y le dispara una notificación push+email (`GymNotificationsService.notifyClassSpotAvailable`) — envuelto en `try/catch` para que un fallo de notificación nunca haga fallar la cancelación en sí. |

`GET /gym/classes/bookings/mine`, `POST /gym/classes/bookings` y `POST
/gym/classes/bookings/:bookingId/cancel` devuelven además `startTime`/
`endTime` (copiados de `GymClass.schedule` en el momento de reservar/listar)
— el frontend los usa para armar el evento de "agregar a mi calendario"
(Google Calendar / .ics, ver `gymbro/frontend/src/lib/calendar.ts`) sin
tener que resolver la clase por separado.

### `gym/notifications` — Auth (Fase 3)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /gym/notifications/vapid-public-key` | — | Clave pública VAPID para que el frontend haga `PushManager.subscribe`. `null` si el server no tiene VAPID configurado. |
| `POST /gym/notifications/subscribe` | — | Guarda una suscripción push del navegador del socio (dedup por `endpoint`). |
| `POST /gym/notifications/unsubscribe` | — | Elimina una suscripción por `endpoint`. |
| `POST /gym/notifications/announcements/:id/publish` | `admin`, `superadmin` | Dispara push+email a todos los socios activos (`role: member`, `accountStatus: active`) para un anuncio ya creado, y recién ahí pone `notifyPush`/`notifyEmail` en `true` — separado del alta del anuncio a propósito, para que un admin pueda revisar/editar antes de notificar a todos. Devuelve `{notifiedPush, notifiedEmail}` con los conteos. |

**Web Push (`GymWebPushService`)**: primer uso de `web-push`/VAPID en el
backend compartido. `isConfigured` exige las dos claves VAPID (a diferencia
de Stripe/Mercado Pago no hay flag `*_ENABLED` separado, no tiene sentido
tener las claves y no usarlas). Sin configurar, la app degrada solo a
email — nunca rompe. Un envío que devuelve `404`/`410` (suscripción
vencida/inválida del lado del navegador) se detecta y esa suscripción se
podda sola de `pushSubscriptions` en el próximo intento, sin intervención
manual.

### `gym/reminders` — público, protegido por secreto compartido (2026-09-08)

| Método y ruta | Descripción |
|---|---|
| `POST /gym/reminders/expiring-soon` | Manda el recordatorio de vencimiento (push + email) a todos los socios con membresía `active` que vence dentro de `EXPIRING_SOON_DAYS` (7 días — mismo umbral que el aviso visual de `HomePage.tsx`/`MembresiaPage.tsx`). Devuelve `{checked, notified, failed}`. |

Sin `JwtAuthGuard`/`RolesGuard` porque lo dispara la GitHub Action diaria
(`.github/workflows/gym-membership-reminders.yml`, cron `0 8 * * *` ≈
09:00-10:00 España), no un socio logueado — mismo motivo que los webhooks de
`gym/payments`. Se protege con un header `x-cron-secret` comparado contra
`GYM_CRON_SECRET`: si la env var no está configurada en el server, el
endpoint queda cerrado por completo (nunca "abierto por defecto"). Cada
socio notificado tiene cooldown de `REMINDER_COOLDOWN_HOURS` (20h,
`lastExpirationReminderSentAt`) para no duplicar el mail si el workflow se
dispara más de una vez el mismo día (reintento manual, doble trigger).

## Notas técnicas

- **Nunca correr con `tsx` un script que importe un schema de este módulo
  con un array de subdocumento de clase** (ej. `GymUserSchema` por
  `pushSubscriptions: [GymPushSubscription]`, o `GymCenterSchema` por
  `schedule: [GymCenterScheduleSlot]`). `tsx` (basado en esbuild) transpila
  los decoradores de forma incompatible con la introspección en runtime que
  hace `SchemaFactory.createForClass` para ese patrón, y tira
  `TypeError: Class constructor X cannot be invoked without 'new'` aunque el
  código esté bien. La app real (`nest start`/`nest build`) no se ve
  afectada. Por eso `scripts/seed-gym-centers.ts` usa el driver nativo de
  Mongo (`db.collection('gym_centers')`) en vez de importar
  `GymCenterSchema` — cualquier script nuevo corrido con `tsx` que necesite
  un schema con este patrón debería seguir el mismo criterio.
- **El `inviteToken` nunca viaja en la respuesta HTTP** de
  `POST /gym/users` (alta manual) — es una credencial que permite fijar la
  contraseña de la cuenta. Sale solo por el mail de invitación (o, en dev
  sin `RESEND_API_KEY`, por un log `[DEV] Invite link for ...` en la
  consola del server) o consultando el documento directo en Mongo.
