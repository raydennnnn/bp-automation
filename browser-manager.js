/**
 * browser-manager.js — Manages a single Puppeteer browser instance.
 * Provides launch / reuse / getPage / close.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const CFG = require('./config');

let browser = null;
let page = null;

/** Launch a new browser (or reuse existing). Returns the page. */
async function launch() {
    if (browser && page && !page.isClosed()) {
        console.log('[Browser] Reusing existing browser.');
        return page;
    }
    if (browser) {
        await browser.close().catch(() => { });
        browser = null;
        page = null;
    }

    console.log('[Browser] Launching Chromium...');
    browser = await puppeteer.launch({
        headless: false,
        slowMo: 50,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    });

    browser.on('disconnected', () => {
        console.log('[Browser] Disconnected.');
        browser = null;
        page = null;
    });

    // Use the default blank tab instead of opening a second one
    const pages = await browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Create dirs
    if (!fs.existsSync(CFG.SCREENSHOT_DIR)) fs.mkdirSync(CFG.SCREENSHOT_DIR, { recursive: true });
    if (!fs.existsSync(CFG.DOWNLOAD_DIR)) fs.mkdirSync(CFG.DOWNLOAD_DIR, { recursive: true });

    // Set download path via CDP
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CFG.DOWNLOAD_DIR,
    });

    return page;
}

/** Get current page (may be null). */
function getPage() {
    if (!browser || !page || page.isClosed()) return null;
    return page;
}

/** Is the browser still alive? */
function isAlive() {
    return !!(browser && page && !page.isClosed());
}

/** Close everything. */
async function close() {
    if (browser) {
        await browser.close().catch(() => { });
        browser = null;
        page = null;
    }
}

module.exports = { launch, getPage, isAlive, close };
