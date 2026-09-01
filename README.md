# Portfolio — Backend

API en **NestJS** que da soporte tanto al formulario de contacto del portfolio como al formulario de recomendaciones de la guía de huéspedes de Airbnb (proyecto `airbnb-app`, frontend separado que comparte este mismo backend). Guarda cada envío en **MongoDB** (colecciones separadas), envía notificaciones por email usando **Resend**. Incluye validación (`class-validator`), un campo honeypot anti-spam y un rate limiter simple en memoria (5 requests / 10 min por IP) en ambos endpoints.

## Cómo levantar el proyecto

```bash
npm install
cp .env.example .env    # completar las variables (ver tabla abajo)
npm run start:dev        # http://localhost:3000, con hot-reload
```

Otros comandos útiles:

```bash
npm run start       # modo normal, sin watch
npm run build        # compila a dist/
npm run start:prod   # corre el build compilado (requiere haber hecho build antes)
```

Necesitás una instancia de MongoDB corriendo (local, vía MongoDB Compass/`mongod`, o un cluster de Atlas) apuntada por `MONGODB_URI` — sin esto, el backend no arranca.

## Endpoint

`POST /contact`

Body esperado:

```json
{
  "name": "string",
  "email": "string (email válido)",
  "subject": "string",
  "message": "string (mínimo 10 caracteres)",
  "company": "string (opcional — honeypot, dejar vacío)"
}
```

Responde `204 No Content` si todo salió bien. Si `company` viene con contenido, se asume que es un bot y el envío se descarta en silencio (sin guardar ni enviar emails).

`POST /recommendations`

Usado por la guía de huéspedes de Airbnb (`airbnb-app/frontend`). Body esperado:

```json
{
  "name": "string",
  "email": "string (email válido)",
  "message": "string (mínimo 5 caracteres)",
  "company": "string (opcional — honeypot, dejar vacío)"
}
```

Responde `204 No Content` si todo salió bien. Igual que `/contact`, `company` es un honeypot silencioso. A diferencia del formulario de contacto, este flujo es **privado**: la recomendación se guarda en MongoDB (colección `airbnb_recommendations`) y se notifica solo a Mariano por email — no se envía ninguna auto-respuesta al huésped ni se muestra públicamente en el sitio.

## Variables de entorno

Definidas en `.env` (a partir de `.env.example`):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto en el que escucha la API. | `3000` |
| `FRONTEND_URL` | Origen(es) permitidos por CORS. Lista separada por comas — incluir tanto el portfolio como el airbnb-app. | `http://localhost:5173,http://localhost:5174` |
| `MONGODB_URI` | Connection string de MongoDB. En local (MongoDB Compass) apunta a la base `MARIAN_PORTFOLIO`; en producción, el connection string de tu cluster de Atlas. Ambos módulos (`contacts` y `airbnb_recommendations`) usan la misma base de datos, en colecciones separadas. | `mongodb://127.0.0.1:27017/MARIAN_PORTFOLIO` |
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) para el envío de emails. Si no se define, el backend loguea los emails en consola en vez de enviarlos (útil para desarrollo). | `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `CONTACT_FROM_EMAIL` | Dirección remitente de los emails salientes. Mientras no tengas un dominio verificado en Resend, tiene que ser `onboarding@resend.dev`. | `onboarding@resend.dev` |
| `CONTACT_RECEIVER_EMAIL` | Email donde llega la notificación de "nuevo mensaje de contacto" del portfolio. | `mariano.maciasgandulfo@gmail.com` |
| `AIRBNB_RECEIVER_EMAIL` | Email donde llega la notificación de "nueva recomendación" de un huésped. Opcional — si no se define, usa `CONTACT_RECEIVER_EMAIL`. | `mariano.maciasgandulfo@gmail.com` |

> ⚠️ Con el plan gratuito de Resend y sin dominio verificado, solo se puede enviar a la dirección con la que te registraste — esto limita la auto-respuesta a quien completa el formulario de contacto (puede ser cualquier persona). Se soluciona verificando un dominio propio en Resend. El formulario de recomendaciones no se ve afectado por este límite porque solo envía a tu propia dirección.

Más detalle general del proyecto completo (frontend + backend + guía de despliegue gratuito) en el `README.md` de la carpeta raíz `portfolio-app/`.
