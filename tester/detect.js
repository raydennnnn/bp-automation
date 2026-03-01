/**
 * Puppeteer Headless Detection Debugger
 * Helps identify if a website knows you are an automated script/bot.
 *
 * HOW TO USE:
 * 1. Set TEST_URL to the website you want to test.
 * 2. Toggle RUN_HEADLESS to true or false.
 * 3. Run: `node detect.js`
 *
 * HOW TO INTERPRET RESULTS:
 * - navigator.webdriver: If TRUE, the site 100% knows you are a bot. (Should be false for humans)
 * - User Agent: If it contains "HeadlessChrome", the site knows you are a bot.
 * - Plugins length: Humans usually have > 0 plugins (PDF viewers, etc.). Headless Chrome often has 0.
 * - Languages: Bots often don't set languages correctly, showing empty or weird values.
 * - Platform: Sometimes bots show Linux while testing on Windows/Mac, creating suspicion.
 */

const puppeteer = require('puppeteer');
// OPTIONAL: Using Puppeteer Extra with Stealth Plugin to bypass detection
// Note: You must run `npm install puppeteer-extra puppeteer-extra-plugin-stealth` first.
// const puppeteerExtra = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteerExtra.use(StealthPlugin());

const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TEST_URL = 'https://uhudaeaseapp.uk.gov.in/easeapp/'; // A great site to test bot detection
const RUN_HEADLESS = "new"; // Setup: 'new' (headless) or false (visible browser)

const OUTPUT_DIR = path.resolve(__dirname);
const HTML_OUTPUT = path.join(OUTPUT_DIR, 'page_dump.html');
const SCREENSHOT_OUTPUT = path.join(OUTPUT_DIR, 'screenshot.png');

async function runDebugger() {
    console.log(`\n🚀 Starting Puppeteer Debugger (Headless: ${RUN_HEADLESS})`);

    // Launch Browser
    // Note: If using stealth plugin, change `puppeteer.launch` to `puppeteerExtra.launch`
    const browser = await puppeteer.launch({
        headless: RUN_HEADLESS,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
        // Adding a realistic user agent manually helps slightly, but Stealth plugin works better
        // defaultViewport: null, 
    });

    try {
        const page = await browser.newPage();

        // --- 4. Capture Console Logs from the page ---
        console.log(`\n[🔍 Capturing Page Console]`);
        page.on('console', msg => {
            console.log(`   └─ Page Log (${msg.type()}): ${msg.text().substring(0, 100)}`);
        });

        // --- 5. Capture Network Request Failures ---
        console.log(`\n[📡 Monitoring Network]`);
        page.on('requestfailed', request => {
            console.log(`   └─ Failed: ${request.url().substring(0, 60)}... | Error: ${request.failure()?.errorText}`);
        });

        // --- 8. Print timing information ---
        console.log(`\n⏱️  Navigating to ${TEST_URL}...`);
        console.time('Page Load Time');

        await page.goto(TEST_URL, {
            waitUntil: 'networkidle2', // Wait until network is mostly silent
            timeout: 60000
        });

        console.timeEnd('Page Load Time');

        console.log(`\n=============================================`);
        console.log(`           BOT DETECTION PROPERTIES          `);
        console.log(`=============================================\n`);

        // --- 3. Evaluate Browser Environment Properties ---
        const browserEnv = await page.evaluate(() => {
            return {
                // navigator.webdriver is the biggest giveaway of automation
                webdriver: navigator.webdriver,
                // The browser string sent to the server
                userAgent: navigator.userAgent,
                // Automated browsers often have zero plugins
                pluginsLength: navigator.plugins.length,
                // Language settings
                languages: navigator.languages,
                // Operating system identifier
                platform: navigator.platform,
                navigatorVendor: navigator.vendor,
                // Screen resolution
                screen: {
                    width: screen.width,
                    height: screen.height,
                    availWidth: screen.availWidth,
                    availHeight: screen.availHeight,
                }
            };
        });

        // Print the extracted properties
        console.log(`1. Webdriver Flag (True = Bot): \t${browserEnv.webdriver ? '🔴 DETECTED (True)' : '🟢 OK (False/Undefined)'}`);

        const hasHeadlessInUA = browserEnv.userAgent.toLowerCase().includes('headless');
        console.log(`2. User Agent: \t\t\t\t${hasHeadlessInUA ? '🔴 SUSPICIOUS (Contains Headless)' : '🟢 OK'} \n   -> "${browserEnv.userAgent}"`);

        console.log(`3. Plugins Length: \t\t\t${browserEnv.pluginsLength === 0 ? '🟡 SUSPICIOUS (0 plugins)' : `🟢 OK (${browserEnv.pluginsLength})`}`);
        console.log(`4. Languages: \t\t\t\t${!browserEnv.languages || browserEnv.languages.length === 0 ? '🔴 SUSPICIOUS (Empty)' : `🟢 OK (${browserEnv.languages.join(', ')})`}`);
        console.log(`5. Platform: \t\t\t\t${browserEnv.platform || '🔴 SUSPICIOUS (Empty)'}`);
        console.log(`6. Vendor: \t\t\t\t${browserEnv.navigatorVendor || 'Unknown'}`);
        console.log(`7. Screen Size: \t\t\t${browserEnv.screen.width}x${browserEnv.screen.height}`);

        // --- 6. Take a full-page screenshot ---
        console.log(`\n📸 Taking full page screenshot...`);
        await page.screenshot({ path: SCREENSHOT_OUTPUT, fullPage: true });
        console.log(`   └─ Saved to: ${SCREENSHOT_OUTPUT}`);

        // --- 7. Save page HTML to a file ---
        console.log(`\n📄 Saving HTML source code...`);
        const html = await page.content();
        fs.writeFileSync(HTML_OUTPUT, html);
        console.log(`   └─ Saved to: ${HTML_OUTPUT}`);

    } catch (err) {
        console.error(`\n❌ Error during execution:`, err);
    } finally {
        console.log(`\n🛑 Closing Browser...`);
        await browser.close();
        console.log(`✅ Done!`);
    }
}

// Execute
runDebugger();
