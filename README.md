# s1-module Proxy Backend

A lightweight Express proxy that forwards AI API requests to OpenAI and Google Gemini,
deployed on **Vercel**. This bypasses WiFi networks that block AI platform domains
via DNS/SNI filtering.

## How it works

```
Electron App  ──►  https://your-app.vercel.app/proxy/openai/...
                                │
                                ▼  (Vercel server makes the real call)
                    https://api.openai.com/v1/chat/completions

Electron App  ──►  https://your-app.vercel.app/proxy/gemini/...
                                │
                                ▼
                    https://generativelanguage.googleapis.com/...
```

Your API keys are forwarded transparently in request headers — nothing is stored here.
The proxy is protected by a shared secret (`x-proxy-secret` header) so only your app can use it.

---

## Deploy to Vercel

### 1. Install Vercel CLI (if not installed)
```bash
npm i -g vercel
```

### 2. Deploy
```bash
cd backend
vercel --prod
```

### 3. Set the secret env var in Vercel dashboard
Go to your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `PROXY_SECRET` | *(random string, e.g. from step below)* |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Configure the Electron app
Edit `%AppData%\s1-module-config\config.json`:
```json
{
  "proxyUrl": "https://your-app.vercel.app",
  "proxySecret": "<same value as PROXY_SECRET>"
}
```

Restart the app — done ✅

---

## Local development / testing

```bash
cp .env.example .env
# Edit .env and set PROXY_SECRET=anything

node server.js
```

Health check:
```bash
curl http://localhost:3333/health
```

---

## Security

- **Secret token**: Every request from the Electron app includes `x-proxy-secret` header.
  Requests without a valid secret get a `401 Unauthorized` response.
- **API keys**: Travel in `Authorization` / `x-goog-api-key` headers per-request — not stored anywhere.
- **CORS**: Open (required for Electron), but the secret token is the real protection.

---

## Disable proxy (direct API calls)

In `%AppData%\s1-module-config\config.json`, set `proxyUrl` to empty string:
```json
{ "proxyUrl": "" }
```
The app will call AI APIs directly without going through Vercel.
