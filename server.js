/**
 * server.js — Express API for the Building Permit & CCMS automation.
 *
 * Endpoints:
 *   POST /auth/start          { username, password }  → start login, return CAPTCHA image
 *   POST /auth/complete       { captchaText }         → submit CAPTCHA, wait for dashboard
 *   GET  /auth/status                                 → { active: bool }
 *
 *   POST /api/run-workflow    — BP Task List automation
 *   POST /api/run-proposal   — BP Proposal List automation
 *   POST /api/run-ccms       — CCMS automation
 */

const express = require('express');
const cors = require('cors');
const auth = require('./auth');
const bp = require('./building-permit');
const ccms = require('./court-case');
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

// ── BP: Task List ────────────────────────────────────────────
app.post('/api/run-workflow', async (req, res) => {
    try {
        const filters = req.body;
        console.log('[Server] Starting BP task-list workflow with filters:', filters);
        const result = await bp.runFullWorkflow(filters);
        if (result.success === false) return res.status(500).json(result);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Server] Workflow error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── BP: Proposal List ────────────────────────────────────────
app.post('/api/run-proposal', async (req, res) => {
    try {
        const params = req.body;
        console.log('[Server] Starting BP proposal workflow with params:', params);
        const result = await bp.runProposalWorkflow(params);
        if (result.success === false) return res.status(500).json(result);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Server] Proposal error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── CCMS ─────────────────────────────────────────────────────
app.post('/api/run-ccms', async (req, res) => {
    try {
        const params = req.body;
        console.log('[Server] Starting CCMS workflow with params:', params);
        const result = await ccms.runCCMSWorkflow(params);
        if (result.success === false) return res.status(500).json(result);
        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Server] CCMS error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  Automation Server running on http://127.0.0.1:${PORT}`);
    console.log(`  Endpoints:`);
    console.log(`    POST /auth/start         — begin login`);
    console.log(`    POST /auth/complete       — submit captcha`);
    console.log(`    GET  /auth/status         — session alive?`);
    console.log(`    POST /api/run-workflow    — BP task list`);
    console.log(`    POST /api/run-proposal    — BP proposal list`);
    console.log(`    POST /api/run-ccms        — CCMS court case\n`);
});
