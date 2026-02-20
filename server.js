/**
 * server.js — Express API for the Building Permit automation.
 *
 * Endpoints:
 *   POST /auth/start          { username, password }  → start login, return CAPTCHA image
 *   POST /auth/complete       { captchaText }         → submit CAPTCHA, wait for dashboard
 *   GET  /auth/status                                 → { active: bool }
 *
 *   POST /api/run-workflow    { action, searchColumn, searchKeyword }
 *                             → full automation (navigate, filter, extract, download)
 */

const express = require('express');
const cors = require('cors');
const auth = require('./auth');
const bp = require('./building-permit');
const bm = require('./browser-manager');

const app = express();
const PORT = require('./config').SERVER_PORT;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.originalUrl}`);
    if (req.method === 'POST') {
        const body = { ...req.body };
        if (body.password) body.password = '********';
        console.log(`[Server] Body:`, JSON.stringify(body));
    }
    next();
});

// ── Auth ─────────────────────────────────────────────────────────
app.post('/auth/start', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username & password required' });
    const result = await auth.startLogin(username, password);
    res.status(result.success ? 200 : 500).json(result);
});

app.post('/auth/complete', async (req, res) => {
    const { captchaText } = req.body;
    if (!captchaText) return res.status(400).json({ error: 'captchaText required' });
    const result = await auth.completeLogin(captchaText);
    res.status(result.success ? 200 : 500).json(result);
});

app.get('/auth/status', (req, res) => {
    res.json({ active: bm.isAlive() });
});

// ── Automation (Task List) ────────────────────────────────────
app.post('/api/run-workflow', async (req, res) => {
    try {
        const filters = req.body;
        console.log('[Server] Starting task-list workflow with filters:', filters);
        const result = await bp.runFullWorkflow(filters);
        if (result.success === false) return res.status(500).json(result);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Server] Workflow error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Automation (Proposal List) ────────────────────────────────
app.post('/api/run-proposal', async (req, res) => {
    try {
        const params = req.body;
        console.log('[Server] Starting proposal workflow with params:', params);
        const result = await bp.runProposalWorkflow(params);
        if (result.success === false) return res.status(500).json(result);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Server] Proposal error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  BP Automation Server running on http://127.0.0.1:${PORT}`);
    console.log(`  Endpoints:`);
    console.log(`    POST /auth/start         — begin login`);
    console.log(`    POST /auth/complete       — submit captcha`);
    console.log(`    GET  /auth/status         — session alive?`);
    console.log(`    POST /api/run-workflow    — task list automation`);
    console.log(`    POST /api/run-proposal    — proposal list automation\n`);
});
