/**
 * building-permit.js — Core automation for the Building Permit module.
 *
 * Flow:
 *   1. navigateToBP()       → click "View More" to reach the task list
 *   2. applyFilters(f)      → set Action dropdown, search column, keyword
 *   3. extractTable()       → read all visible rows with named fields
 *   4. openRow(i)           → click the action button on row i
 *   5. extractHeading()     → grab "Sec Verification - HRDA/…" from <strong>
 *   6. extractWorkflow()    → click Workflow tab → scrape every <li>
 *   7. downloadAttachments()→ click Attachment tab → expand panels → download all
 *   8. goBack()             → return to the task list
 *   9. runFullWorkflow(f)   → orchestrate 1-8
 */

const fs = require('fs');
const path = require('path');
const bm = require('./browser-manager');
const CFG = require('./config');
const { autoConvert, isLikelyKrutidev } = require('./krutidev-converter');

const SD = CFG.SEL_DASH;
const ST = CFG.SEL_TASK;
const SX = CFG.SEL_DETAIL;

// ─── Helpers ─────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(name) {
    const page = bm.getPage();
    if (!page) return;
    const fp = path.join(CFG.SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: fp, fullPage: false }).catch(() => { });
}

/**
 * Select a dropdown option by visible text (case-insensitive partial match).
 */
async function selectByText(page, selector, text) {
    try {
        const el = await page.$(selector);
        if (!el) { console.warn(`[BP] Dropdown not found: ${selector}`); return false; }

        // Read all options
        const opts = await page.$eval(selector, s =>
            Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
        );
        console.log(`[BP] Dropdown options:`, opts.map(o => o.text));

        // Scroll into view
        await page.evaluate(e => e.scrollIntoView({ block: 'center' }), el);
        await sleep(300);

        // Try exact value first
        const picked = await page.select(selector, text).catch(() => []);
        if (picked.length > 0) {
            console.log(`[BP] ✅ Selected "${text}" by value`);
        } else {
            // Fuzzy text match
            const norm = text.trim().toLowerCase();
            const match = opts.find(o =>
                o.text.toLowerCase().includes(norm) || norm.includes(o.text.toLowerCase())
            );
            if (match) {
                await page.select(selector, match.value);
                console.log(`[BP] ✅ Selected "${match.text}" (val: ${match.value})`);
            } else {
                console.warn(`[BP] ❌ No match for "${text}"`);
                return false;
            }
        }

        // Trigger Angular change events
        await page.$eval(selector, e => {
            e.dispatchEvent(new Event('change', { bubbles: true }));
            e.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await sleep(2000);
        return true;
    } catch (err) {
        console.error(`[BP] selectByText error:`, err.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
//  1. NAVIGATE TO BUILDING PERMIT
// ═══════════════════════════════════════════════════════════════
async function navigateToBP() {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        console.log('[BP] Navigating to Building Permit module...');
        await page.waitForSelector(SD.BP_VIEW_MORE, { timeout: 15_000 });

        // Read total cases badge — poll up to 15s for it to load (starts as 0)
        let totalCases = null;
        try {
            console.log('[BP] Waiting for total cases badge to load...');
            const pollStart = Date.now();
            while (Date.now() - pollStart < 15_000) {
                totalCases = await page.$eval(SD.TOTAL_CASES, el => el.innerText.trim()).catch(() => null);
                if (totalCases && totalCases !== '0' && totalCases !== '') {
                    break;
                }
                await sleep(1000);
            }
            console.log(`[BP] Total cases badge: ${totalCases}`);
        } catch (_) { }

        // Click "View More" via JavaScript (bypasses Puppeteer clickability check)
        const vmEl = await page.$(SD.BP_VIEW_MORE);
        if (!vmEl) return { success: false, error: '"View More" button not found' };

        await page.evaluate(el => el.scrollIntoView({ block: 'center' }), vmEl);
        await sleep(500);

        await Promise.all([
            page.evaluate(el => el.click(), vmEl),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CFG.NAV_TIMEOUT }).catch(() => { }),
        ]);
        await sleep(3000);

        console.log('[BP] ✅ On Building Permit page.');
        return { success: true, totalCases };
    } catch (err) {
        console.error('[BP] navigateToBP error:', err.message);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  2. APPLY FILTERS
// ═══════════════════════════════════════════════════════════════

/**
 * Dynamically find the Action dropdown by scanning all <select> elements
 * for the one whose first option text contains "Action".
 * Returns the CSS selector string (by injecting a temp ID) or null.
 */
async function findActionDropdown(page) {
    const selector = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        for (const s of selects) {
            const firstOpt = s.options && s.options[0];
            if (firstOpt && /action/i.test(firstOpt.text)) {
                // Inject a temporary ID so Puppeteer can target it
                if (!s.id) s.id = '__bp_action_filter__';
                return '#' + s.id;
            }
        }
        return null;
    });

    if (selector) {
        console.log(`[BP] ✅ Found Action dropdown: ${selector}`);
    } else {
        console.warn('[BP] ❌ Could not find Action dropdown by placeholder text');
        // Log all dropdowns for diagnosis
        const allSelects = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('select')).map((s, i) => ({
                index: i,
                id: s.id || '(none)',
                name: s.name || '(none)',
                firstOption: s.options && s.options[0] ? s.options[0].text.trim() : '(empty)',
            }));
        });
        console.log('[BP] All dropdowns on page:', JSON.stringify(allSelects, null, 2));
    }
    return selector;
}

async function applyFilters(filters = {}) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    console.log('[BP] Applying filters:', JSON.stringify(filters));

    // Action dropdown — find dynamically
    if (filters.action) {
        const actionSel = await findActionDropdown(page);
        if (actionSel) {
            await selectByText(page, actionSel, filters.action);
        } else {
            console.warn('[BP] ⚠ Skipping action filter — dropdown not found');
        }
    }

    // Search column dropdown
    if (filters.searchColumn) {
        await selectByText(page, ST.SEARCH_COLUMN, filters.searchColumn);
    }

    // Search keyword (text input)
    if (filters.searchKeyword) {
        const kwEl = await page.$(ST.SEARCH_KEYWORD);
        if (kwEl) {
            await page.click(ST.SEARCH_KEYWORD, { clickCount: 3 });
            await page.type(ST.SEARCH_KEYWORD, filters.searchKeyword);
            console.log(`[BP] Typed keyword: "${filters.searchKeyword}"`);
        }
    }

    await sleep(3000);
    await screenshot('after_filters');
    console.log('[BP] ✅ Filters applied.');
    return { success: true };
}

// ═══════════════════════════════════════════════════════════════
//  3. EXTRACT TABLE
// ═══════════════════════════════════════════════════════════════
async function extractTable() {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        await page.waitForSelector(ST.TABLE, { timeout: 15_000 });

        // Headers
        const headers = await page.$eval(ST.TABLE_HEADER, thead =>
            Array.from(thead.querySelectorAll('th')).map(th => th.innerText.trim())
        ).catch(() => ['#', 'Application No.', 'File No.', 'Applicant Name', 'Date', 'Service Name', 'Status', 'Due Date', 'Days', 'Action']);

        // Rows as arrays
        const rawRows = await page.$$eval(ST.TABLE_ROWS, rows =>
            rows.map(row =>
                Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim())
            )
        );

        // Convert to named objects
        const rows = rawRows.map(cells => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
            return obj;
        });

        console.log(`[BP] Extracted ${rows.length} table rows.`);
        return { success: true, headers, rows };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  4. OPEN ROW ACTION
// ═══════════════════════════════════════════════════════════════
async function openRow(rowIndex = 0) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        const sel = ST.ROW_ACTION_BTN(rowIndex);
        console.log(`[BP] Clicking row ${rowIndex} action: ${sel}`);
        await page.waitForSelector(sel, { timeout: 10_000 });

        await Promise.all([
            page.click(sel),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CFG.NAV_TIMEOUT }).catch(() => { }),
        ]);
        await sleep(3000);

        await screenshot('after_row_click');
        console.log('[BP] ✅ Detail page loaded.');
        return { success: true };
    } catch (err) {
        console.error('[BP] openRow error:', err.message);
        await screenshot('debug_row_error');
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  5. EXTRACT HEADING
// ═══════════════════════════════════════════════════════════════
async function extractHeading() {
    const page = bm.getPage();
    if (!page) return null;

    try {
        console.log('[BP] Extracting heading...');
        await sleep(2000);

        const heading = await page.evaluate(() => {
            // Strategy 1: <strong> with file-number pattern
            const strongs = document.querySelectorAll('strong');
            for (const el of strongs) {
                const t = el.innerText.trim();
                if (t && /HRDA\//i.test(t)) return t;
                if (t && /Verification/i.test(t)) return t;
                if (t && /\w+\/\w+\/\w+\/\d+\/\d+-\d+/.test(t)) return t;
            }

            // Strategy 2: any strong with "Sec" or "request"
            for (const el of strongs) {
                const t = el.innerText.trim();
                if (t && (/Sec\s/i.test(t) || /request/i.test(t) || /Data change/i.test(t))) return t;
            }

            // Strategy 3: h4 or h5 with similar pattern
            for (const tag of ['h4', 'h5', 'h3', 'h1']) {
                const els = document.querySelectorAll(tag);
                for (const el of els) {
                    const t = el.innerText.trim();
                    if (t && /HRDA\//i.test(t)) return t;
                }
            }

            // Strategy 4: breadcrumb
            const crumbs = document.querySelectorAll('.breadcrumb-item');
            if (crumbs.length > 0) return crumbs[crumbs.length - 1].innerText.trim();

            return null;
        });

        console.log('[BP] Heading:', heading);
        return heading;
    } catch (err) {
        console.error('[BP] extractHeading error:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  6. CLICK TAB (helper)
// ═══════════════════════════════════════════════════════════════
async function clickTab(tabId, tabName) {
    const page = bm.getPage();
    if (!page) return false;

    console.log(`[BP] Clicking tab: ${tabName} (${tabId})`);
    try {
        let tab = await page.$(tabId);

        if (!tab) {
            // Fallback: XPath text match
            console.log(`[BP] ID not found, trying text match for "${tabName}"...`);
            const tabs = await page.$x(`//a[contains(., "${tabName}")]`);
            if (tabs.length > 0) {
                tab = tabs[0];
            } else {
                console.warn(`[BP] Tab "${tabName}" not found!`);
                return false;
            }
        }

        const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
        if (!isActive) {
            await tab.click();
            await sleep(2000);
        } else {
            console.log(`[BP] Tab already active.`);
        }
        return true;
    } catch (err) {
        console.error(`[BP] clickTab error (${tabName}):`, err.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
//  7. EXTRACT WORKFLOW
// ═══════════════════════════════════════════════════════════════
/**
 * Clicks the Workflow tab and scrapes each <li>:
 *   - Process Name (from <h4>, stripping badges/spans)
 *   - Status       (from .badge inside <h4>)
 *   - Start Date   (from .col-md-5 text)
 *   - End Date     (from .col-md-5 text)
 *   - Assigned To  (from .col-md-3 text)
 *   - Remarks      (from <pre>)
 */
async function extractWorkflow() {
    const page = bm.getPage();
    if (!page) return [];

    try {
        console.log('[BP] === Extracting Workflow ===');

        // Click Workflow tab
        const clicked = await clickTab(SX.TAB_WORKFLOW, 'Workflow');
        if (!clicked) {
            await screenshot('debug_workflow_tab_fail');
            return [];
        }

        // Wait for items — try several selectors
        const candidates = [
            '#tab-workflow-panel li',
            'app-workflow li',
            'app-workflow ul li',
            'div[role="tabpanel"] li',
        ];

        let foundSel = null;
        for (const sel of candidates) {
            try {
                await page.waitForSelector(sel, { visible: true, timeout: 10_000 });
                foundSel = sel;
                console.log(`[BP] Found workflow items: ${sel}`);
                break;
            } catch (_) {
                console.log(`[BP] Selector "${sel}" — no match.`);
            }
        }

        if (!foundSel) {
            console.warn('[BP] No workflow items found.');
            await screenshot('debug_workflow_empty');
            // Dump diagnostic
            const html = await page.evaluate(() => {
                const p = document.querySelector('#tab-workflow-panel');
                return p ? p.innerHTML.substring(0, 500) : 'Panel NOT FOUND';
            });
            console.log('[BP] Panel HTML (first 500 chars):', html);
            return [];
        }

        // Scrape each <li>
        const timeline = await page.evaluate((sel) => {
            const items = [];
            const lis = document.querySelectorAll(sel);

            lis.forEach((li, idx) => {
                const item = { _index: idx };

                // ── Process Name + Status from <h4> ──
                const h4 = li.querySelector('h4');
                if (h4) {
                    // Badge = status
                    const badge = h4.querySelector('.badge');
                    if (badge) item.status = badge.innerText.trim();

                    // Process name: clone, strip children, read leftover text
                    const clone = h4.cloneNode(true);
                    clone.querySelectorAll('.badge, .float-right, .d-inline-block, .text-muted').forEach(c => c.remove());
                    let name = clone.innerText.replace(/Process Name:/i, '').trim();
                    item.process_name = name || null;
                }

                // ── Dates from .col-md-5 ──
                const dateDivs = li.querySelectorAll('.col-md-5');
                dateDivs.forEach(d => {
                    const txt = d.innerText;
                    const sm = txt.match(/Start Date[:\s]*([0-9/.\-:\s]+)/i);
                    const em = txt.match(/End Date[:\s]*([0-9/.\-:\s]+)/i);
                    if (sm) item.start_date = sm[1].trim();
                    if (em) item.end_date = em[1].trim();
                });

                // ── Assigned To from .col-md-3 ──
                const asgDivs = li.querySelectorAll('.col-md-3');
                asgDivs.forEach(d => {
                    const txt = d.innerText.trim();
                    if (txt && !item.assigned_to) {
                        item.assigned_to = txt;
                    }
                });

                // ── Remarks from <pre> ──
                const pre = li.querySelector('pre');
                if (pre) {
                    item.remarks = pre.innerText.trim();
                }

                // ── Detail content (if any visible div.collapse.show) ──
                const detail = li.querySelector('.collapse.show');
                if (detail) {
                    item.detail_content = detail.innerText.trim();
                }

                // ── Fallback: grab full text if nothing structured ──
                if (!item.process_name && !item.remarks) {
                    const rawText = li.innerText.trim();
                    if (rawText.length > 5) {
                        item.raw_text = rawText.substring(0, 300);
                    }
                }

                // Only include items that have meaningful content
                const hasMeaning = item.process_name || item.remarks || item.raw_text;
                if (hasMeaning) {
                    delete item._index; // clean up
                    items.push(item);
                }
            });

            return items;
        }, foundSel);

        console.log(`[BP] ✅ Extracted ${timeline.length} workflow items (from ${foundSel}).`);

        // Auto-convert Krutidev-encoded Hindi remarks to Unicode
        let convertedCount = 0;
        for (const item of timeline) {
            if (item.remarks && isLikelyKrutidev(item.remarks)) {
                item.remarks_original = item.remarks;
                item.remarks = autoConvert(item.remarks);
                convertedCount++;
            }
            if (item.raw_text && isLikelyKrutidev(item.raw_text)) {
                item.raw_text_original = item.raw_text;
                item.raw_text = autoConvert(item.raw_text);
            }
        }
        if (convertedCount > 0) {
            console.log(`[BP] 🔄 Auto-converted ${convertedCount} Krutidev remarks to Unicode Hindi.`);
        }

        // Diagnostic: show first 3 items
        if (timeline.length > 0) {
            console.log('[BP] Workflow preview (first 3):');
            timeline.slice(0, 3).forEach((w, i) => {
                console.log(`  ${i + 1}. ${w.process_name || w.raw_text?.substring(0, 60) || 'N/A'} [${w.status || ''}]`);
            });
        }

        await screenshot('after_workflow');
        return timeline;

    } catch (err) {
        console.error('[BP] extractWorkflow error:', err.message);
        await screenshot('debug_workflow_fatal');
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
//  8. DOWNLOAD ATTACHMENTS
// ═══════════════════════════════════════════════════════════════
/**
 * Clicks Attachment tab, expands every accordion panel, loops
 * through ALL download buttons inside each panel, waits for
 * each download to finish (no .crdownload leftovers).
 */
async function downloadAttachments() {
    const page = bm.getPage();
    if (!page) return { panels: [], files: [] };

    try {
        console.log('[BP] === Downloading Attachments ===');

        // Click Attachment tab
        const clicked = await clickTab(SX.TAB_ATTACHMENT, 'Attachment');
        if (!clicked) return { panels: [], files: [] };

        await sleep(2000);

        // Wait for panels
        try {
            await page.waitForSelector(SX.ATTACHMENT_PANELS, { visible: true, timeout: 10_000 });
        } catch (_) {
            console.warn('[BP] No attachment panels found.');
            return { panels: [], files: [] };
        }

        await sleep(2000);

        const panels = await page.$$(SX.ATTACHMENT_PANELS);
        console.log(`[BP] Found ${panels.length} attachment panels.`);

        const allMeta = [];      // metadata per attachment
        let downloadCount = 0;

        for (let i = 0; i < panels.length; i++) {
            try {
                // Re-query to avoid stale handles
                const currentPanels = await page.$$(SX.ATTACHMENT_PANELS);
                const panel = currentPanels[i];
                if (!panel) continue;

                // Panel title
                let title = `Attachment_${i + 1}`;
                try {
                    title = await panel.$eval(SX.PANEL_HEADER_BTN,
                        el => el.innerText.trim().split('\n')[0].trim()
                    );
                } catch (_) { }

                console.log(`[BP] Panel ${i + 1}: "${title}"`);

                // Expand if collapsed
                const headerBtn = await panel.$(SX.PANEL_HEADER_BTN);
                if (headerBtn) {
                    const expanded = await page.evaluate(el => el.getAttribute('aria-expanded'), headerBtn);
                    if (expanded !== 'true') {
                        await headerBtn.click();
                        await sleep(1500);
                    }
                }

                // Find ALL rows inside the expanded panel
                const rows = await panel.$$('tbody tr');
                if (rows.length === 0) {
                    console.log(`[BP]   No attachment rows in this panel.`);
                    continue;
                }

                for (let r = 0; r < rows.length; r++) {
                    // Re-query to avoid stale handles after DOM changes
                    const freshPanels = await page.$$(SX.ATTACHMENT_PANELS);
                    const freshPanel = freshPanels[i];
                    if (!freshPanel) break;
                    const freshRows = await freshPanel.$$('tbody tr');
                    const row = freshRows[r];
                    if (!row) break;

                    // Extract row metadata
                    const meta = await page.evaluate(tr => {
                        const tds = tr.querySelectorAll('td');
                        return {
                            description: tds[1] ? tds[1].innerText.trim() : '',
                            date: tds[2] ? tds[2].innerText.trim() : '',
                        };
                    }, row);
                    meta.panelTitle = title;

                    // Click download button
                    const dlBtn = await row.$('button[ngbtooltip="Download Attachment"], button:has(i.fa-download)');
                    if (!dlBtn) {
                        // Fallback: XPath
                        const dlBtns = await row.$x('.//button[.//i[contains(@class, "fa-download")]]');
                        if (dlBtns.length > 0) {
                            console.log(`[BP]   Downloading: "${meta.description}" (${meta.date})`);
                            const filesBefore = new Set(fs.readdirSync(CFG.DOWNLOAD_DIR));
                            await dlBtns[0].click();
                            await waitForDownload(filesBefore);
                            downloadCount++;
                            meta.downloaded = true;
                        } else {
                            console.log(`[BP]   No download button for row ${r + 1}`);
                            meta.downloaded = false;
                        }
                    } else {
                        console.log(`[BP]   Downloading: "${meta.description}" (${meta.date})`);
                        const filesBefore = new Set(fs.readdirSync(CFG.DOWNLOAD_DIR));
                        await dlBtn.click();
                        await waitForDownload(filesBefore);
                        downloadCount++;
                        meta.downloaded = true;
                    }

                    allMeta.push(meta);
                }

                // Collapse panel to keep DOM clean
                const collapseBtn = await panel.$(SX.PANEL_HEADER_BTN);
                if (collapseBtn) {
                    const exp = await page.evaluate(el => el.getAttribute('aria-expanded'), collapseBtn);
                    if (exp === 'true') {
                        await collapseBtn.click();
                        await sleep(500);
                    }
                }

            } catch (panelErr) {
                console.warn(`[BP] Error in panel ${i + 1}:`, panelErr.message);
            }
        }

        const filesOnDisk = fs.readdirSync(CFG.DOWNLOAD_DIR).filter(f => !f.endsWith('.crdownload'));
        console.log(`[BP] ✅ Downloads complete. ${downloadCount} triggered, ${filesOnDisk.length} files on disk.`);

        return { panels: allMeta, files: filesOnDisk };

    } catch (err) {
        console.error('[BP] downloadAttachments error:', err.message);
        return { panels: [], files: [] };
    }
}

/**
 * Wait until a new file appears in the download dir and no .crdownload files remain.
 */
async function waitForDownload(filesBefore) {
    const start = Date.now();
    const timeout = CFG.DOWNLOAD_TIMEOUT;

    while (Date.now() - start < timeout) {
        await sleep(500);
        const current = fs.readdirSync(CFG.DOWNLOAD_DIR);
        const hasCrdownload = current.some(f => f.endsWith('.crdownload'));
        const hasNew = current.some(f => !filesBefore.has(f) && !f.endsWith('.crdownload'));

        if (hasNew && !hasCrdownload) {
            return; // download finished
        }
    }
    console.warn('[BP] Download wait timed out (may still be downloading).');
}

// ═══════════════════════════════════════════════════════════════
//  9. GO BACK
// ═══════════════════════════════════════════════════════════════
async function goBack() {
    const page = bm.getPage();
    if (!page) return;

    try {
        console.log('[BP] Going back to task list...');
        const btn = await page.$(SX.BACK_BUTTON);
        if (btn) {
            await Promise.all([
                btn.click(),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => { }),
            ]);
        } else {
            console.warn('[BP] Back button not found, using browser back.');
            await page.goBack({ waitUntil: 'networkidle2' }).catch(() => { });
        }
        await sleep(2000);
    } catch (err) {
        console.warn('[BP] goBack error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  FULL WORKFLOW ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════
async function runFullWorkflow(filters = CFG.DEFAULT_FILTERS) {
    console.log('[BP] ════════════ STARTING FULL WORKFLOW ════════════');
    if (!fs.existsSync(CFG.SCREENSHOT_DIR)) fs.mkdirSync(CFG.SCREENSHOT_DIR, { recursive: true });

    const page = bm.getPage();
    if (!page) return { success: false, error: 'No active session' };

    // Step 1: Navigate to BP module
    console.log('[BP] Step 1: Navigate to Building Permit...');
    const navResult = await navigateToBP();
    if (!navResult.success) return navResult;

    // Step 2: Apply filters
    console.log('[BP] Step 2: Apply filters...');
    const filterResult = await applyFilters(filters);
    if (!filterResult.success) return filterResult;

    // Wait for rows
    try {
        await page.waitForSelector(ST.TABLE_ROWS, { timeout: 15_000 });
    } catch (_) {
        return { success: false, error: 'No rows after filter' };
    }

    // Step 3: Extract table
    console.log('[BP] Step 3: Extract table...');
    const tableResult = await extractTable();

    const firstRow = (tableResult.rows && tableResult.rows.length > 0) ? tableResult.rows[0] : null;
    console.log('[BP] First row:', JSON.stringify(firstRow));

    // Step 4: Open first row
    console.log('[BP] Step 4: Open first row...');
    const openResult = await openRow(0);
    if (!openResult.success) {
        return { ...tableResult, error: 'Failed to open row: ' + openResult.error };
    }

    await screenshot('detail_page');

    // Step 5: Heading
    console.log('[BP] Step 5: Extract heading...');
    const heading = await extractHeading();

    // Step 6: Workflow
    console.log('[BP] Step 6: Extract workflow...');
    const workflow = await extractWorkflow();

    // Step 7: Attachments (DISABLED for testing — uncomment when workflow is verified)
    console.log('[BP] Step 7: Download attachments... [SKIPPED — testing mode]');
    // const attachments = await downloadAttachments();
    const attachments = { panels: [], files: [], _skipped: true };

    // Step 8: Go back
    console.log('[BP] Step 8: Go back...');
    await goBack();

    console.log('[BP] ════════════ WORKFLOW COMPLETE ════════════');
    console.log(`[BP] Result summary: heading="${heading}", rows=${(tableResult.rows || []).length}, workflow=${workflow.length}, attachmentPanels=${attachments.panels?.length || 0}`);

    return {
        heading,
        totalCases: navResult.totalCases,
        filters_used: filters,
        first_row: firstRow,
        all_rows: tableResult.rows || [],
        workflow,
        attachments,
    };
}

// ═══════════════════════════════════════════════════════════════
//  PROPOSAL LIST FUNCTIONS
// ═══════════════════════════════════════════════════════════════
const SP = CFG.SEL_PROPOSAL;

/**
 * Find the Proposal List card by scanning all cards for the one
 * whose header contains "Proposal List".
 * Returns an ElementHandle for the card, or null.
 */
async function findProposalCard(page) {
    const cardHandle = await page.evaluateHandle(() => {
        const cards = document.querySelectorAll('.card');
        for (const card of cards) {
            const h6 = card.querySelector('.card-header h6');
            if (h6 && /Proposal\s*List/i.test(h6.innerText)) return card;
        }
        return null;
    });
    const resolved = cardHandle.asElement();
    if (resolved) {
        console.log('[BP] ✅ Found Proposal List card.');
    } else {
        console.warn('[BP] ❌ Proposal List card not found.');
    }
    return resolved;
}

/**
 * Click the Search button on the Proposal List card,
 * fill File No and/or Applicant Name, then click Find.
 */
async function applyProposalSearch(params = {}) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    console.log('[BP] Applying proposal search:', JSON.stringify(params));

    try {
        const card = await findProposalCard(page);
        if (!card) return { success: false, error: 'Proposal List card not found' };

        // Click the Search button inside the card header
        const searchBtn = await card.$('.card-header button.btn-info');
        if (searchBtn) {
            await searchBtn.click();
            console.log('[BP] ✅ Clicked Search button.');
            await sleep(2000);
        } else {
            console.warn('[BP] Search button not found in Proposal List header.');
        }

        // Fill File No
        if (params.fileNo) {
            const fileInput = await page.$(SP.FILE_NO_INPUT);
            if (fileInput) {
                await fileInput.click({ clickCount: 3 });
                await fileInput.type(params.fileNo);
                console.log(`[BP] Typed File No: "${params.fileNo}"`);
            }
        }

        // Fill Applicant Name
        if (params.applicantName) {
            const nameInput = await page.$(SP.APPLICANT_INPUT);
            if (nameInput) {
                await nameInput.click({ clickCount: 3 });
                await nameInput.type(params.applicantName);
                console.log(`[BP] Typed Applicant Name: "${params.applicantName}"`);
            }
        }

        // Click Find button — look for button containing "Find" text
        const findBtn = await page.evaluateHandle(() => {
            const btns = document.querySelectorAll('button.btn-info');
            for (const b of btns) {
                if (/Find/i.test(b.innerText)) return b;
            }
            return null;
        });
        const findEl = findBtn.asElement();
        if (findEl) {
            await findEl.click();
            console.log('[BP] ✅ Clicked Find button.');
            await sleep(3000);
        } else {
            console.warn('[BP] Find button not found.');
        }

        await screenshot('after_proposal_search');
        return { success: true };
    } catch (err) {
        console.error('[BP] applyProposalSearch error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Extract rows from the Proposal List table.
 * Headers: #, Application No., File No., Applicant Name, Date, Service Name, Status, Pending With, Action
 */
async function extractProposalTable() {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        const card = await findProposalCard(page);
        if (!card) return { success: false, error: 'Proposal List card not found' };

        // Extract headers
        const headers = await card.$eval('table thead', thead =>
            Array.from(thead.querySelectorAll('th')).map(th => th.innerText.trim())
        ).catch(() => ['#', 'Application No.', 'File No.', 'Applicant Name', 'Date', 'Service Name', 'Status', 'Pending With', 'Action']);

        // Extract rows
        const rawRows = await card.$$eval('table tbody tr', rows =>
            rows.map(row =>
                Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim())
            )
        );

        const rows = rawRows.map(cells => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
            return obj;
        });

        console.log(`[BP] Extracted ${rows.length} proposal rows.`);
        return { success: true, headers, rows };
    } catch (err) {
        console.error('[BP] extractProposalTable error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Click the View button on the given row of the Proposal List.
 * The detail opens in a modal (ngb-modal-window), so we wait for that.
 */
async function openProposalRow(rowIndex = 0) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        const card = await findProposalCard(page);
        if (!card) return { success: false, error: 'Proposal List card not found' };

        const rows = await card.$$('table tbody tr');
        if (rowIndex >= rows.length) {
            return { success: false, error: `Row ${rowIndex} not found (only ${rows.length} rows)` };
        }

        const btn = await rows[rowIndex].$('td:last-child button');
        if (!btn) return { success: false, error: 'View button not found in row' };

        console.log(`[BP] Clicking View on proposal row ${rowIndex}...`);
        await btn.click();

        // Wait for modal to appear
        await page.waitForSelector(SP.MODAL, { visible: true, timeout: 15_000 });
        await sleep(3000);

        console.log('[BP] ✅ Modal opened.');
        await screenshot('proposal_modal');
        return { success: true };
    } catch (err) {
        console.error('[BP] openProposalRow error:', err.message);
        await screenshot('debug_proposal_row_error');
        return { success: false, error: err.message };
    }
}

/**
 * Extract heading from modal: h1 > strong
 */
async function extractHeadingFromModal() {
    const page = bm.getPage();
    if (!page) return null;

    try {
        console.log('[BP] Extracting heading from modal...');
        const heading = await page.$eval(SP.MODAL_HEADING, el => el.innerText.trim()).catch(() => null);
        if (!heading) {
            // Fallback: any strong inside the modal
            const fallback = await page.$eval('ngb-modal-window strong', el => el.innerText.trim()).catch(() => null);
            console.log('[BP] Heading (fallback):', fallback);
            return fallback;
        }
        console.log('[BP] Heading:', heading);
        return heading;
    } catch (err) {
        console.error('[BP] extractHeadingFromModal error:', err.message);
        return null;
    }
}

/**
 * Click the Workflow tab inside the modal and extract workflow items.
 * Scopes all selectors inside ngb-modal-window.
 */
async function extractWorkflowInModal() {
    const page = bm.getPage();
    if (!page) return [];

    try {
        console.log('[BP] === Extracting Workflow (modal) ===');

        // Click Workflow tab inside modal
        let tab = await page.$(SP.MODAL_TAB_WORKFLOW);
        if (!tab) {
            // Fallback: XPath
            const tabs = await page.$x('//ngb-modal-window//a[contains(., "Workflow")]');
            if (tabs.length > 0) tab = tabs[0];
        }
        if (!tab) {
            console.warn('[BP] Workflow tab not found in modal.');
            return [];
        }

        const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
        if (!isActive) {
            await tab.click();
            await sleep(2000);
        }

        // Wait for workflow items
        const candidates = [
            'ngb-modal-window #tab-workflow-panel li',
            'ngb-modal-window app-workflow li',
            'ngb-modal-window app-workflow ul li',
            'ngb-modal-window div[role="tabpanel"] li',
        ];

        let foundSel = null;
        for (const sel of candidates) {
            try {
                await page.waitForSelector(sel, { visible: true, timeout: 8_000 });
                foundSel = sel;
                console.log(`[BP] Found modal workflow items: ${sel}`);
                break;
            } catch (_) {
                console.log(`[BP] Selector "${sel}" — no match in modal.`);
            }
        }

        if (!foundSel) {
            console.warn('[BP] No workflow items found in modal.');
            return [];
        }

        // Reuse the same extraction logic as extractWorkflow
        const timeline = await page.evaluate((sel) => {
            const items = [];
            const lis = document.querySelectorAll(sel);

            lis.forEach((li, idx) => {
                const item = { _index: idx };

                const h4 = li.querySelector('h4');
                if (h4) {
                    const badge = h4.querySelector('.badge');
                    if (badge) item.status = badge.innerText.trim();
                    const clone = h4.cloneNode(true);
                    clone.querySelectorAll('.badge, .float-right, .d-inline-block, .text-muted').forEach(c => c.remove());
                    let name = clone.innerText.replace(/Process Name:/i, '').trim();
                    item.process_name = name || null;
                }

                const dateDivs = li.querySelectorAll('.col-md-5');
                dateDivs.forEach(d => {
                    const txt = d.innerText;
                    const sm = txt.match(/Start Date[:\s]*([0-9/.\-:\s]+)/i);
                    const em = txt.match(/End Date[:\s]*([0-9/.\-:\s]+)/i);
                    if (sm) item.start_date = sm[1].trim();
                    if (em) item.end_date = em[1].trim();
                });

                const asgDivs = li.querySelectorAll('.col-md-3');
                asgDivs.forEach(d => {
                    const txt = d.innerText.trim();
                    if (txt && !item.assigned_to) item.assigned_to = txt;
                });

                const pre = li.querySelector('pre');
                if (pre) item.remarks = pre.innerText.trim();

                // detail_content omitted for proposal list

                if (!item.process_name && !item.remarks) {
                    const rawText = li.innerText.trim();
                    if (rawText.length > 5) item.raw_text = rawText.substring(0, 300);
                }

                const hasMeaning = item.process_name || item.remarks || item.raw_text;
                if (hasMeaning) {
                    delete item._index;
                    items.push(item);
                }
            });

            return items;
        }, foundSel);

        console.log(`[BP] ✅ Extracted ${timeline.length} workflow items from modal.`);

        // Auto-convert Krutidev
        let convertedCount = 0;
        for (const item of timeline) {
            if (item.remarks && isLikelyKrutidev(item.remarks)) {
                item.remarks = autoConvert(item.remarks);
                convertedCount++;
            }
        }
        if (convertedCount > 0) {
            console.log(`[BP] 🔄 Auto-converted ${convertedCount} Krutidev remarks to Unicode Hindi.`);
        }

        if (timeline.length > 0) {
            console.log('[BP] Workflow preview (first 3):');
            timeline.slice(0, 3).forEach((w, i) => {
                console.log(`  ${i + 1}. ${w.process_name || 'N/A'} [${w.status || ''}]`);
            });
        }

        await screenshot('proposal_workflow');
        return timeline;

    } catch (err) {
        console.error('[BP] extractWorkflowInModal error:', err.message);
        return [];
    }
}

/**
 * Download attachments from inside the modal.
 * Scopes panel selectors inside ngb-modal-window.
 */
async function downloadAttachmentsInModal() {
    const page = bm.getPage();
    if (!page) return { panels: [], files: [] };

    try {
        console.log('[BP] === Downloading Attachments (modal) ===');

        // Click Attachment tab inside modal
        let tab = await page.$(SP.MODAL_TAB_ATTACHMENT);
        if (!tab) {
            const tabs = await page.$x('//ngb-modal-window//a[contains(., "Attachment")]');
            if (tabs.length > 0) tab = tabs[0];
        }
        if (!tab) {
            console.warn('[BP] Attachment tab not found in modal.');
            return { panels: [], files: [] };
        }

        const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
        if (!isActive) {
            await tab.click();
            await sleep(2000);
        }

        // Wait for panels
        try {
            await page.waitForSelector(SP.MODAL_ATTACHMENT_PANELS, { visible: true, timeout: 10_000 });
        } catch (_) {
            console.warn('[BP] No attachment panels found in modal.');
            return { panels: [], files: [] };
        }
        await sleep(2000);

        const panels = await page.$$(SP.MODAL_ATTACHMENT_PANELS);
        console.log(`[BP] Found ${panels.length} attachment panels in modal.`);

        const allMeta = [];
        let downloadCount = 0;

        for (let i = 0; i < panels.length; i++) {
            try {
                const currentPanels = await page.$$(SP.MODAL_ATTACHMENT_PANELS);
                const panel = currentPanels[i];
                if (!panel) continue;

                let title = `Attachment_${i + 1}`;
                try {
                    title = await panel.$eval('.card-header button',
                        el => el.innerText.trim().split('\n')[0].trim()
                    );
                } catch (_) { }

                console.log(`[BP] Panel ${i + 1}: "${title}"`);

                // Expand if collapsed
                const headerBtn = await panel.$('.card-header button');
                if (headerBtn) {
                    const expanded = await page.evaluate(el => el.getAttribute('aria-expanded'), headerBtn);
                    if (expanded !== 'true') {
                        await headerBtn.click();
                        await sleep(1500);
                    }
                }

                const rows = await panel.$$('tbody tr');
                if (rows.length === 0) {
                    console.log(`[BP]   No attachment rows in this panel.`);
                    continue;
                }

                for (let r = 0; r < rows.length; r++) {
                    const freshPanels = await page.$$(SP.MODAL_ATTACHMENT_PANELS);
                    const freshPanel = freshPanels[i];
                    if (!freshPanel) break;
                    const freshRows = await freshPanel.$$('tbody tr');
                    const row = freshRows[r];
                    if (!row) break;

                    const meta = await page.evaluate(tr => {
                        const tds = tr.querySelectorAll('td');
                        return {
                            description: tds[1] ? tds[1].innerText.trim() : '',
                            date: tds[2] ? tds[2].innerText.trim() : '',
                        };
                    }, row);
                    meta.panelTitle = title;

                    const dlBtn = await row.$('button[ngbtooltip="Download Attachment"], button:has(i.fa-download)');
                    if (!dlBtn) {
                        const dlBtns = await row.$x('.//button[.//i[contains(@class, "fa-download")]]');
                        if (dlBtns.length > 0) {
                            console.log(`[BP]   Downloading: "${meta.description}" (${meta.date})`);
                            const filesBefore = new Set(fs.readdirSync(CFG.DOWNLOAD_DIR));
                            await dlBtns[0].click();
                            await waitForDownload(filesBefore);
                            downloadCount++;
                            meta.downloaded = true;
                        } else {
                            meta.downloaded = false;
                        }
                    } else {
                        console.log(`[BP]   Downloading: "${meta.description}" (${meta.date})`);
                        const filesBefore = new Set(fs.readdirSync(CFG.DOWNLOAD_DIR));
                        await dlBtn.click();
                        await waitForDownload(filesBefore);
                        downloadCount++;
                        meta.downloaded = true;
                    }
                    allMeta.push(meta);
                }

                // Collapse
                const collapseBtn = await panel.$('.card-header button');
                if (collapseBtn) {
                    const exp = await page.evaluate(el => el.getAttribute('aria-expanded'), collapseBtn);
                    if (exp === 'true') {
                        await collapseBtn.click();
                        await sleep(500);
                    }
                }
            } catch (panelErr) {
                console.warn(`[BP] Error in modal panel ${i + 1}:`, panelErr.message);
            }
        }

        const filesOnDisk = fs.readdirSync(CFG.DOWNLOAD_DIR).filter(f => !f.endsWith('.crdownload'));
        console.log(`[BP] ✅ Downloads complete. ${downloadCount} triggered, ${filesOnDisk.length} files on disk.`);
        return { panels: allMeta, files: filesOnDisk };

    } catch (err) {
        console.error('[BP] downloadAttachmentsInModal error:', err.message);
        return { panels: [], files: [] };
    }
}

// ═══════════════════════════════════════════════════════════════
//  PROPOSAL WORKFLOW ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════
async function runProposalWorkflow(params = CFG.DEFAULT_PROPOSAL_PARAMS) {
    console.log('[BP] ════════════ STARTING PROPOSAL WORKFLOW ════════════');
    if (!fs.existsSync(CFG.SCREENSHOT_DIR)) fs.mkdirSync(CFG.SCREENSHOT_DIR, { recursive: true });
    if (!fs.existsSync(CFG.DOWNLOAD_DIR)) fs.mkdirSync(CFG.DOWNLOAD_DIR, { recursive: true });

    const page = bm.getPage();
    if (!page) return { success: false, error: 'No active session' };

    // Step 1: Navigate to BP module
    console.log('[BP] Step 1: Navigate to Building Permit...');
    const navResult = await navigateToBP();
    if (!navResult.success) return navResult;

    // Step 2: Apply proposal search
    console.log('[BP] Step 2: Apply proposal search...');
    const searchResult = await applyProposalSearch(params);
    if (!searchResult.success) return searchResult;

    // Step 3: Extract proposal table
    console.log('[BP] Step 3: Extract proposal table...');
    const tableResult = await extractProposalTable();

    const firstRow = (tableResult.rows && tableResult.rows.length > 0) ? tableResult.rows[0] : null;
    console.log('[BP] First row:', JSON.stringify(firstRow));

    if (!firstRow) {
        return { success: false, error: 'No rows found in Proposal List' };
    }

    // Step 4: Open first row (modal)
    console.log('[BP] Step 4: Open first row (modal)...');
    const openResult = await openProposalRow(0);
    if (!openResult.success) {
        return { ...tableResult, error: 'Failed to open proposal row: ' + openResult.error };
    }

    // Step 5: Heading from modal
    console.log('[BP] Step 5: Extract heading from modal...');
    const heading = await extractHeadingFromModal();

    // Step 6: Workflow from modal
    console.log('[BP] Step 6: Extract workflow from modal...');
    const workflow = await extractWorkflowInModal();

    // Step 7: Attachments from modal (DISABLED for testing — uncomment when ready)
    console.log('[BP] Step 7: Download attachments from modal... [SKIPPED — testing mode]');
    // const attachments = await downloadAttachmentsInModal();
    const attachments = { panels: [], files: [], _skipped: true };

    console.log('[BP] ════════════ PROPOSAL WORKFLOW COMPLETE ════════════');
    console.log(`[BP] Result summary: heading="${heading}", rows=${(tableResult.rows || []).length}, workflow=${workflow.length}`);

    return {
        mode: 'proposal',
        heading,
        totalCases: navResult.totalCases,
        search_params: params,
        first_row: firstRow,
        all_rows: tableResult.rows || [],
        workflow,
        attachments,
    };
}

// ═══════════════════════════════════════════════════════════════
module.exports = {
    navigateToBP,
    applyFilters,
    extractTable,
    openRow,
    extractHeading,
    extractWorkflow,
    downloadAttachments,
    goBack,
    runFullWorkflow,
    // Proposal List
    applyProposalSearch,
    extractProposalTable,
    openProposalRow,
    extractHeadingFromModal,
    extractWorkflowInModal,
    downloadAttachmentsInModal,
    runProposalWorkflow,
};
