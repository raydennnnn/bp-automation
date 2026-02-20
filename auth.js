/**
 * auth.js — Login flow with CAPTCHA OCR via Tesseract.
 *
 * Exports:
 *   startLogin(username, password)  → { success, captchaImage }
 *   completeLogin(captchaText)      → { success, message }
 */

const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const bm = require('./browser-manager');
const CFG = require('./config');

const S = CFG.SEL_LOGIN;

// ─── Start Login ─────────────────────────────────────────────────
async function startLogin(username, password) {
    console.log('[Auth] Starting login...');
    try {
        const page = await bm.launch();

        // Navigate to login page
        console.log(`[Auth] Navigating to ${CFG.LOGIN_URL}...`);
        try {
            await page.goto(CFG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: CFG.NAV_TIMEOUT });
        } catch (e) {
            console.log('[Auth] Nav timeout ignored (heavy site).');
        }

        // Wait for form
        console.log('[Auth] Waiting for login form...');
        await page.waitForSelector(S.USERNAME, { timeout: CFG.ELEMENT_TIMEOUT });

        // Clear + type credentials
        await page.click(S.USERNAME, { clickCount: 3 });
        await page.type(S.USERNAME, username);

        await page.click(S.PASSWORD, { clickCount: 3 });
        await page.type(S.PASSWORD, password);

        // Capture CAPTCHA canvas as base64 screenshot
        console.log('[Auth] Capturing CAPTCHA...');
        const captchaEl = await page.waitForSelector(S.CAPTCHA_CANVAS, { timeout: CFG.ELEMENT_TIMEOUT });
        await sleep(1000); // let it render
        const captchaBase64 = await captchaEl.screenshot({ encoding: 'base64' });

        console.log('[Auth] Ready for CAPTCHA input.');
        return { success: true, captchaImage: `data:image/png;base64,${captchaBase64}` };

    } catch (err) {
        console.error('[Auth] startLogin error:', err.message);
        return { success: false, error: err.message };
    }
}

// ─── Complete Login ──────────────────────────────────────────────
async function completeLogin(captchaText) {
    console.log(`[Auth] Submitting CAPTCHA: "${captchaText}"`);
    try {
        const page = bm.getPage();
        if (!page) throw new Error('No active browser session. Call startLogin first.');

        // Type CAPTCHA
        const captchaInput = await page.$(S.CAPTCHA_INPUT);
        if (captchaInput) {
            await captchaInput.click({ clickCount: 3 });
            await page.type(S.CAPTCHA_INPUT, captchaText);
        }

        // Click submit
        await page.click(S.SUBMIT_BTN);

        // Wait for dashboard
        console.log(`[Auth] Waiting for dashboard (timeout: ${CFG.NAV_TIMEOUT / 1000}s)...`);
        try {
            await page.waitForSelector(S.DASHBOARD, { timeout: CFG.NAV_TIMEOUT });
            console.log('[Auth] ✅ Dashboard found! Login successful.');
            return { success: true, message: 'Login Successful' };
        } catch (waitErr) {
            console.warn('[Auth] Dashboard not found within timeout.');
            return { success: false, error: 'Login failed — wrong CAPTCHA or dashboard too slow.' };
        }

    } catch (err) {
        console.error('[Auth] completeLogin error:', err.message);
        return { success: false, error: err.message };
    }
}

// ─── OCR CAPTCHA ─────────────────────────────────────────────────
async function solveCaptcha(base64Image) {
    console.log('[OCR] Initializing Tesseract...');

    // Save for debugging
    const imgBuf = Buffer.from(base64Image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const capPath = path.join(CFG.SCREENSHOT_DIR, 'captcha_latest.png');
    fs.writeFileSync(capPath, imgBuf);
    console.log(`[OCR] Saved CAPTCHA to: ${capPath}`);

    const worker = await createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        tessedit_pageseg_mode: '7', // single text line
    });

    const { data: { text } } = await worker.recognize(capPath);
    await worker.terminate();

    const cleaned = text.trim().replace(/\s/g, '');
    console.log(`[OCR] Recognized: "${cleaned}"`);
    return cleaned;
}

// ─── Helpers ─────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { startLogin, completeLogin, solveCaptcha };
