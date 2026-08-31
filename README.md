# Portfolio — Backend

API en **NestJS** que da soporte al formulario de contacto del portfolio de Mariano Macías. Guarda cada mensaje en **MongoDB**, envía un email de notificación al dueño del sitio y una auto-respuesta a quien escribió, usando **Resend**. Incluye validación (`class-validator`), un campo honeypot anti-spam y un rate limiter simple en memoria (5 requests / 10 min por IP).

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

## Variables de entorno

Definidas en `.env` (a partir de `.env.example`):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto en el que escucha la API. | `3000` |
| `FRONTEND_URL` | Origen(es) permitidos por CORS. Puede ser una lista separada por comas. | `http://localhost:5173` |
| `MONGODB_URI` | Connection string de MongoDB. En local (MongoDB Compass) apunta a la base `MARIAN_PORTFOLIO`; en producción, el connection string de tu cluster de Atlas. | `mongodb://127.0.0.1:27017/MARIAN_PORTFOLIO` |
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) para el envío de emails. Si no se define, el backend loguea los emails en consola en vez de enviarlos (útil para desarrollo). | `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `CONTACT_FROM_EMAIL` | Dirección remitente de los emails salientes. Mientras no tengas un dominio verificado en Resend, tiene que ser `onboarding@resend.dev`. | `onboarding@resend.dev` |
| `CONTACT_RECEIVER_EMAIL` | Email donde llega la notificación de "nuevo mensaje de contacto". | `mariano.maciasgandulfo@gmail.com` |

> ⚠️ Con el plan gratuito de Resend y sin dominio verificado, solo se puede enviar a la dirección con la que te registraste — esto limita la auto-respuesta a quien completa el formulario (puede ser cualquier persona). Se soluciona verificando un dominio propio en Resend.

Más detalle general del proyecto completo (frontend + backend + guía de despliegue gratuito) en el `README.md` de la carpeta raíz `portfolio-app/`.
