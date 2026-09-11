'use strict';

/**
 * s1-module-proxy — Vercel-compatible Express proxy
 *
 * Routes:
 *   GET  /health              → status check
 *   POST /proxy/openai/*      → https://api.openai.com/*   (streaming)
 *
 * The Electron app forwards the real API key in the Authorization header.
 * No keys are stored here.
 */

const express = require('express');
const cors = require('cors');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// Public URL so allow all origins — the secret token is the real guard.
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: '*' }));
app.options('*', cors());


// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// ── OpenAI proxy ──────────────────────────────────────────────────────────────
// Electron sends:  POST https://your-app.vercel.app/proxy/openai/v1/chat/completions
// Forwarded to:    POST https://api.openai.com/v1/chat/completions
app.all('/proxy/openai/*', async (req, res) => {
    // Strip the /proxy/openai prefix to get the real API path
    const apiPath = req.path.replace(/^\/proxy\/openai/, '') || '/';
    const targetUrl = `https://api.openai.com${apiPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

    console.log(`[PROXY][OpenAI] ${req.method} ${apiPath}`);

    // Forward headers — drop host, keep auth and content-type
    const forwardHeaders = {};
    for (const [key, val] of Object.entries(req.headers)) {
        if (['host', 'x-proxy-secret', 'connection', 'transfer-encoding'].includes(key)) continue;
        forwardHeaders[key] = val;
    }

    try {
        // Read full request body for POST/PUT
        const body = await readBody(req);

        const upstreamRes = await fetch(targetUrl, {
            method: req.method,
            headers: forwardHeaders,
            body: body || undefined,
            // Node 18+ fetch supports streaming
            duplex: 'half',
        });

        // Copy status and headers back
        res.status(upstreamRes.status);
        upstreamRes.headers.forEach((val, key) => {
            if (['transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
            res.setHeader(key, val);
        });

        // Stream the response body back to the client
        if (upstreamRes.body) {
            const reader = upstreamRes.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
        }
        res.end();
    } catch (err) {
        console.error('[PROXY][OpenAI] Error:', err.message);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Proxy error: ' + err.message });
        }
    }
});


// ── Helper: read raw request body as a Buffer ─────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : null));
        req.on('error', reject);
    });
}

// ── Local dev server (not used on Vercel) ────────────────────────────────────
// Vercel invokes the exported app directly; listen() is only for local testing.
if (require.main === module) {
    const PORT = process.env.PROXY_PORT || 3333;
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`[PROXY] Listening on http://127.0.0.1:${PORT}`);
        console.log(`[PROXY] Route: /proxy/openai/*`);
        if (process.send) process.send({ type: 'ready', port: PORT });
    });
}

// Export for Vercel
module.exports = app;
