/**
 * run.js — CLI runner: auto-login with OCR CAPTCHA, then run full workflow.
 *
 * Usage:
 *   Terminal 1:  node server.js
 *   Terminal 2:  node run.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const CFG = require('./config');

// ─── Helpers ─────────────────────────────────────────────────────
function request(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: CFG.SERVER_HOST,
            port: CFG.SERVER_PORT,
            path: apiPath,
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

        const req = http.request(opts, res => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
                catch (e) { reject(new Error(`Parse error: ${raw.substring(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function solveCaptcha(base64Image) {
    console.log('[OCR] Initializing Tesseract…');
    const imgBuf = Buffer.from(base64Image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const capPath = path.join(CFG.SCREENSHOT_DIR, 'captcha_latest.png');
    if (!fs.existsSync(CFG.SCREENSHOT_DIR)) fs.mkdirSync(CFG.SCREENSHOT_DIR, { recursive: true });
    fs.writeFileSync(capPath, imgBuf);

    const worker = await createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        tessedit_pageseg_mode: '7',
    });
    const { data: { text } } = await worker.recognize(capPath);
    await worker.terminate();

    const cleaned = text.trim().replace(/\s/g, '');
    console.log(`[OCR] Result: "${cleaned}"`);
    return cleaned;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   BUILDING PERMIT — FULL AUTOMATION             ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`Filter: action = "${CFG.DEFAULT_FILTERS.action}"`);
    console.log('');

    // ── LOGIN ────────────────────────────────────────────────────
    let loggedIn = false;

    for (let attempt = 1; attempt <= CFG.MAX_CAPTCHA_RETRIES; attempt++) {
        console.log(`\n── LOGIN ATTEMPT ${attempt}/${CFG.MAX_CAPTCHA_RETRIES} ──`);

        const startRes = await request('POST', '/auth/start', {
            username: CFG.USERNAME,
            password: CFG.PASSWORD,
        });

        if (!startRes.data.success) {
            console.error('[Login] Start failed:', startRes.data.error);
            return;
        }
        console.log('[Login] Credentials entered. CAPTCHA received.');

        // OCR the CAPTCHA
        let captchaText;
        try {
            captchaText = await solveCaptcha(startRes.data.captchaImage);
        } catch (e) {
            console.error('[Login] OCR error:', e.message);
            continue;
        }
        if (!captchaText || captchaText.length < 2) {
            console.warn(`[Login] Weak OCR: "${captchaText}". Retrying…`);
            continue;
        }

        // Submit CAPTCHA
        console.log(`[Login] Submitting CAPTCHA: "${captchaText}"…`);
        const compRes = await request('POST', '/auth/complete', { captchaText });

        if (compRes.data.success) {
            console.log('✅ Login Successful!');
            loggedIn = true;
            break;
        } else {
            console.warn(`[Login] Attempt ${attempt} failed: ${compRes.data.error}`);
        }
    }

    if (!loggedIn) {
        console.error('\n❌ All login attempts failed.');
        return;
    }

    // ── INTERACTIVE MODE SELECTION ────────────────────────────────
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    console.log('\n┌──────────────────────────────────────┐');
    console.log('│  Choose a mode:                      │');
    console.log('│    T = Task List                     │');
    console.log('│    P = Proposal List                 │');
    console.log('└──────────────────────────────────────┘');
    const mode = (await ask('  Mode (T/P): ')).trim().toUpperCase();

    let endpoint, body;

    if (mode === 'P') {
        // ── PROPOSAL LIST ──
        console.log('\n── Proposal List Mode ──');
        const fileNo = (await ask('  File No (or press Enter to skip): ')).trim();
        const applicantName = (await ask('  Applicant Name (or press Enter to skip): ')).trim();
        endpoint = '/api/run-proposal';
        body = { fileNo, applicantName };
        console.log(`\n  Params: ${JSON.stringify(body)}`);
    } else {
        // ── TASK LIST (default) ──
        console.log('\n── Task List Mode ──');
        console.log('  Action filter: "Sec Verification" (fixed)');
        const searchColumn = (await ask('  Search By Column (or press Enter to skip): ')).trim();
        const searchKeyword = (await ask('  Search Keyword (or press Enter to skip): ')).trim();
        endpoint = '/api/run-workflow';
        body = { action: 'Sec Verification' };
        if (searchColumn) body.searchColumn = searchColumn;
        if (searchKeyword) body.searchKeyword = searchKeyword;
        console.log(`\n  Filters: ${JSON.stringify(body)}`);
    }
    rl.close();

    // ── RUN ──────────────────────────────────────────────────────
    console.log('\n── RUNNING WORKFLOW ──');

    try {
        const res = await request('POST', endpoint, body);

        if (res.data.success === false) {
            console.error('\n❌ Workflow failed:', res.data.error);
            return;
        }

        const data = res.data.data || res.data;

        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║   ✅ AUTOMATION COMPLETE                         ║');
        console.log('╚══════════════════════════════════════════════════╝');

        console.log('\n── Summary ──');
        console.log(`  Mode           : ${data.mode || 'task-list'}`);
        console.log(`  Heading        : ${data.heading || '(none)'}`);
        console.log(`  Total Cases    : ${data.totalCases || '(unknown)'}`);
        console.log(`  Table Rows     : ${data.all_rows ? data.all_rows.length : 0}`);

        if (data.first_row) {
            console.log('\n── First Row Details ──');
            for (const [k, v] of Object.entries(data.first_row)) {
                console.log(`  ${k.padEnd(18)}: ${v}`);
            }
        }

        console.log(`\n── Workflow Steps: ${data.workflow ? data.workflow.length : 0} ──`);
        if (data.workflow) {
            data.workflow.forEach((step, i) => {
                console.log(`  ${i + 1}. ${step.process_name || 'N/A'} [${step.status || ''}]`);
                console.log(`     ${step.start_date || ''} → ${step.end_date || ''}`);
                console.log(`     Person: ${step.assigned_to || 'N/A'}`);
                if (step.remarks) console.log(`     Remarks: ${step.remarks.substring(0, 80)}`);
            });
        }

        const files = data.attachments?.files || [];
        console.log(`\n── Attachments: ${files.length} files ──`);
        files.forEach(f => console.log(`  • ${f}`));

        // Save to disk
        fs.writeFileSync(CFG.OUTPUT_FILE, JSON.stringify(data, null, 2));
        console.log(`\n✅ Full data saved to: ${CFG.OUTPUT_FILE}`);

    } catch (err) {
        console.error('\n❌ Workflow request error:', err.message);
        console.log('Make sure server.js is running (node server.js)');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
