/**
 * court-case.js — Court Case Management System (CCMS) automation.
 *
 * Functions:
 *   navigateToCCMS()        — click View More on CCMS dashboard card
 *   applyCCMSFilters()      — select Action + Sector dropdown filters
 *   extractCCMSTable()      — extract rows from the CCMS Task List
 *   openCCMSRow(i)          — click action button on row i
 *   extractCCMSHeading()    — extract heading from detail page
 *   extractCaseInformation()— extract Property Info, Case Details, GIS Coordinates
 *   extractCCMSWorkflow()   — extract workflow items
 *   performAction()         — select action, type remarks, click Save Draft
 *   runCCMSWorkflow()       — full orchestrator
 */

const fs = require('fs');
const path = require('path');
const bm = require('./browser-manager');
const CFG = require('./config');
const { autoConvert, isLikelyKrutidev } = require('./krutidev-converter');

const CD = CFG.SEL_CCMS_DASH;
const CC = CFG.SEL_CCMS;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(name) {
    try {
        const page = bm.getPage();
        if (!page) return;
        const fp = path.join(CFG.SCREENSHOT_DIR, `${name}.png`);
        await page.screenshot({ path: fp, fullPage: false });
        console.log(`[CCMS] 📸 ${name}.png`);
    } catch (_) { }
}

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════

async function navigateToCCMS() {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        console.log('[CCMS] Navigating to Court Case Management System...');

        // Wait for View More button
        await page.waitForSelector(CD.VIEW_MORE, { timeout: 15_000 });

        // Read total cases badge — poll up to 15s
        let totalCases = null;
        try {
            console.log('[CCMS] Waiting for total cases badge...');
            const pollStart = Date.now();
            while (Date.now() - pollStart < 15_000) {
                totalCases = await page.evaluate(() => {
                    // Find the CCMS card by looking for "Court Case Management System" text
                    const cards = document.querySelectorAll('.row.no-gutters');
                    for (const card of cards) {
                        const txt = card.innerText || '';
                        if (/Court\s*Case\s*Management/i.test(txt)) {
                            const badge = card.querySelector('.border-primary.rounded-circle');
                            if (badge) return badge.innerText.trim();
                        }
                    }
                    return null;
                }).catch(() => null);
                if (totalCases && totalCases !== '0' && totalCases !== '') break;
                await sleep(1000);
            }
            console.log(`[CCMS] Total cases badge: ${totalCases}`);
        } catch (_) { }

        // Click View More
        await Promise.all([
            page.click(CD.VIEW_MORE),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => { }),
        ]);
        await sleep(3000);
        await screenshot('ccms_dashboard');

        console.log('[CCMS] ✅ Navigated to CCMS.');
        return { success: true, totalCases };
    } catch (err) {
        console.error('[CCMS] navigateToCCMS error:', err.message);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  FILTERS (Action + Sector dropdowns)
// ═══════════════════════════════════════════════════════════════

/**
 * Read all options from a <select> by selector.
 * Returns array of { value, text }.
 */
async function getSelectOptions(page, selector) {
    return page.$$eval(selector + ' option', opts =>
        opts.map(o => ({ value: o.value, text: o.innerText.trim() }))
            .filter(o => o.value && !o.value.includes('undefined') && o.text !== '')
    );
}

/**
 * Find the Action and Sector dropdowns dynamically.
 * Returns { actionSel, sectorSel } with CSS selectors or null.
 */
async function findCCMSDropdowns(page) {
    const result = await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        let actionSel = null;
        let sectorSel = null;

        for (let i = 0; i < selects.length; i++) {
            const s = selects[i];
            const firstOpt = s.options && s.options[0];
            if (!firstOpt) continue;

            const txt = firstOpt.text || '';

            if (/Action/i.test(txt) && !actionSel) {
                if (!s.id) s.id = `__ccms_action_filter_${i}__`;
                actionSel = '#' + s.id;
            }
            if (/Sector/i.test(txt) && !sectorSel) {
                if (!s.id) s.id = `__ccms_sector_filter_${i}__`;
                sectorSel = '#' + s.id;
            }
        }

        return { actionSel, sectorSel, totalFound: selects.length };
    });

    if (result.actionSel) {
        console.log(`[CCMS] ✅ Found Action dropdown: ${result.actionSel}`);
    } else {
        console.warn(`[CCMS] ⚠ Action dropdown not found (scanned ${result.totalFound} selects)`);
    }

    if (result.sectorSel) {
        console.log(`[CCMS] ✅ Found Sector dropdown: ${result.sectorSel}`);
    } else {
        console.warn(`[CCMS] ⚠ Sector dropdown not found (scanned ${result.totalFound} selects)`);
    }

    return result;
}

/**
 * Apply action and/or sector filters.
 * params.actionValue = value attribute of the option
 * params.sectorValue = value attribute of the option
 */
async function applyCCMSFilters(params = {}) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    console.log('[CCMS] Applying filters:', JSON.stringify(params));

    try {
        const { actionSel, sectorSel } = await findCCMSDropdowns(page);

        async function selectDropdownOption(selector, value) {
            const el = await page.$(selector);
            if (!el) {
                console.warn(`[CCMS] ❌ Dropdown selector not found: ${selector}`);
                return false;
            }

            // 1. Wait/Scroll into view
            await page.evaluate(e => e.scrollIntoView({ block: 'center' }), el);
            await sleep(300);

            // 2. native select
            console.log(`[CCMS] Selecting value "${value}" on ${selector}...`);
            await page.select(selector, value);

            // 3. Dispatch events to trigger Angular bindings
            await page.$eval(selector, e => {
                e.dispatchEvent(new Event('change', { bubbles: true }));
                e.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await sleep(2000);

            return true;
        }

        if (params.actionValue && actionSel) {
            await selectDropdownOption(actionSel, params.actionValue);
            console.log(`[CCMS] ✅ Selected action. Value: ${params.actionValue}`);
            await sleep(2000);
        }

        if (params.sectorValue && sectorSel) {
            await selectDropdownOption(sectorSel, params.sectorValue);
            console.log(`[CCMS] ✅ Selected sector. Value: ${params.sectorValue}`);
            await sleep(2000);
        }

        await sleep(2000);
        await screenshot('ccms_after_filters');
        return { success: true };
    } catch (err) {
        console.error('[CCMS] applyCCMSFilters error:', err.message);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  FIND TASK LIST CARD (scoped extraction)
// ═══════════════════════════════════════════════════════════════

/**
 * Find the Task List card within the active tab panel.
 * Looks for the card whose h6 header contains "Task List".
 */
async function findTaskListCard(page) {
    const cardHandle = await page.evaluateHandle(() => {
        const cards = document.querySelectorAll('.card');
        for (const card of cards) {
            const h6 = card.querySelector('.card-header h6');
            if (h6 && /Task\s*List/i.test(h6.innerText)) return card;
        }
        return null;
    });
    const resolved = cardHandle.asElement();
    if (resolved) {
        console.log('[CCMS] ✅ Found Task List card.');
    } else {
        console.warn('[CCMS] ❌ Task List card not found.');
    }
    return resolved;
}

// ═══════════════════════════════════════════════════════════════
//  TABLE EXTRACTION (scoped to Task List card)
// ═══════════════════════════════════════════════════════════════

async function extractCCMSTable() {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        const card = await findTaskListCard(page);
        if (!card) {
            // Fallback: use global selector
            console.warn('[CCMS] Falling back to global table selector.');
        }

        let headers, rawRows;

        if (card) {
            // Scoped extraction within the Task List card
            headers = await card.$eval('table thead', thead =>
                Array.from(thead.querySelectorAll('th')).map(th => th.innerText.trim())
            ).catch(() => ['#', 'File/Case No.', 'Sector', 'Defendent', 'Assigned On', 'Status', 'Action']);

            rawRows = await card.$$eval('table tbody tr', rows =>
                rows.map(row =>
                    Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim())
                )
            );
        } else {
            await page.waitForSelector(CC.TASK_LIST_TABLE, { timeout: 10_000 });
            headers = await page.$$eval(CC.TASK_LIST_TABLE + ' thead th', ths =>
                ths.map(th => th.innerText.trim())
            ).catch(() => ['#', 'File/Case No.', 'Sector', 'Defendent', 'Assigned On', 'Status', 'Action']);

            rawRows = await page.$$eval(CC.TASK_LIST_ROWS, rows =>
                rows.map(row =>
                    Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim())
                )
            );
        }

        const rows = rawRows.map(cells => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
            return obj;
        });

        // Always convert Defendent column — it contains Krutidev Hindi names
        const { krutidevToUnicode } = require('./krutidev-converter');
        for (const row of rows) {
            if (row['Defendent']) {
                row['Defendent'] = krutidevToUnicode(row['Defendent']);
            }
            if (row['Defendant']) {
                row['Defendant'] = krutidevToUnicode(row['Defendant']);
            }
        }

        console.log(`[CCMS] Extracted ${rows.length} task list rows.`);
        return { success: true, headers, rows };
    } catch (err) {
        console.error('[CCMS] extractCCMSTable error:', err.message);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  OPEN ROW → navigates to detail page (scoped to Task List card)
// ═══════════════════════════════════════════════════════════════

async function openCCMSRow(rowIndex = 0) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        const card = await findTaskListCard(page);
        let rows;
        if (card) {
            rows = await card.$$('table tbody tr');
        } else {
            rows = await page.$$(CC.TASK_LIST_ROWS);
        }

        if (rowIndex >= rows.length) {
            return { success: false, error: `Row ${rowIndex} not found (only ${rows.length} rows)` };
        }

        const btn = await rows[rowIndex].$(CC.ROW_ACTION_BTN);
        if (!btn) return { success: false, error: 'Action button not found in row' };

        const btnText = await page.evaluate(el => el.innerText.trim(), btn);
        console.log(`[CCMS] Clicking "${btnText}" on row ${rowIndex}...`);

        await Promise.all([
            btn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => { }),
        ]);
        await sleep(3000);

        console.log('[CCMS] ✅ Navigated to detail page.');
        await screenshot('ccms_detail_page');
        return { success: true };
    } catch (err) {
        console.error('[CCMS] openCCMSRow error:', err.message);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  HEADING
// ═══════════════════════════════════════════════════════════════

async function extractCCMSHeading() {
    const page = bm.getPage();
    if (!page) return null;

    try {
        const heading = await page.evaluate(() => {
            const strongs = document.querySelectorAll('strong');
            for (const s of strongs) {
                const txt = s.innerText.trim();
                // Look for pattern like "Hearing (CCMS) - NO/XXX/..."
                if (txt.includes('-') && (txt.includes('CCMS') || txt.includes('UCMS') || txt.includes('NO/') || txt.includes('/'))) {
                    return txt;
                }
            }
            // Fallback: first strong with substantial text
            for (const s of strongs) {
                if (s.innerText.trim().length > 10) return s.innerText.trim();
            }
            return null;
        });
        console.log('[CCMS] Heading:', heading);
        return heading;
    } catch (err) {
        console.error('[CCMS] extractCCMSHeading error:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  CASE INFORMATION (Property Info + Case Details + GIS)
// ═══════════════════════════════════════════════════════════════

async function extractCaseInformation() {
    const page = bm.getPage();
    if (!page) return {};

    try {
        console.log('[CCMS] === Extracting Case Information ===');

        // Click Case Information tab
        let tab = await page.$(CC.TAB_CASE_INFO);
        if (!tab) {
            const tabs = await page.$x('//a[contains(., "Case Information")]');
            if (tabs.length > 0) tab = tabs[0];
        }
        if (tab) {
            const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
            if (!isActive) {
                // Force JS click to bypass Angular overlays
                await page.evaluate(el => el.click(), tab);
                await sleep(2000);
            }
        }

        // Wait until Case Information tab is actually active (aria-selected becomes true)
        try {
            await page.waitForFunction(
                () => {
                    const tab = document.querySelector('#tab-caf');
                    return tab && tab.getAttribute('aria-selected') === 'true';
                },
                { timeout: 15_000 }
            );
            console.log('[CCMS] Case Information tab is now active.');
        } catch (_) {
            console.warn('[CCMS] No panels found after clicking Case Information tab.');
        }

        // Wait extra time for the actual data to populate inside the tab
        await sleep(5000);
        await screenshot('ccms_before_case_extract');

        /**
         * Extract a single panel by its h5 header text.
         * Finds the h5 (case-insensitive includes), gets closest .card ancestor,
         * extracts label-value pairs.
         */
        async function extractSinglePanel(headerText) {
            return page.evaluate((searchText) => {
                const data = {};
                const needle = searchText.toLowerCase();

                // Helper: clean label (remove hidden ID spans)
                function cleanLabel(labelEl) {
                    const clone = labelEl.cloneNode(true);
                    clone.querySelectorAll('span[style]').forEach(s => {
                        const st = s.getAttribute('style') || '';
                        if (st.includes('246') || st.includes('transparent')) s.remove();
                    });
                    return clone.innerText.trim()
                        .replace(/\s*\*\s*/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                }

                // Find the h5 that contains the search text
                const allH5 = document.querySelectorAll('h5');
                let targetCard = null;
                for (const h5 of allH5) {
                    if (h5.innerText.trim().toLowerCase().includes(needle)) {
                        // Walk up to find the closest .card ancestor
                        let el = h5;
                        while (el && el !== document.body) {
                            if (el.classList && el.classList.contains('card')) {
                                targetCard = el;
                                break;
                            }
                            el = el.parentElement;
                        }
                        if (targetCard) break;
                    }
                }

                if (!targetCard) return data;

                // Find the card-body
                let body = targetCard.querySelector('.collapse.show .card-body');
                if (!body) body = targetCard.querySelector('.card-body');
                if (!body) return data;

                // Extract all form-groups
                const formGroups = body.querySelectorAll('.form-group');
                const seen = new Set();

                formGroups.forEach(fg => {
                    const label = fg.querySelector('label, .form-label');
                    if (!label) return;

                    const key = cleanLabel(label);
                    if (!key || seen.has(key)) return;

                    // Value from span.form-control (possibly inside <strong>)
                    const valSpan = fg.querySelector('strong span.form-control, span.form-control');
                    if (valSpan) {
                        data[key] = valSpan.innerText.trim();
                        seen.add(key);
                        return;
                    }

                    // Value from .letter-desc
                    const letterDesc = fg.querySelector('.letter-desc');
                    if (letterDesc) {
                        const val = letterDesc.innerText.trim();
                        if (val) {
                            data[key] = val;
                            seen.add(key);
                        }
                    }
                });

                return data;
            }, headerText);
        }

        // Extract each panel independently
        const propertyInfo = await extractSinglePanel('Property Information');
        console.log(`[CCMS]   Property fields: ${Object.keys(propertyInfo).length}`);

        const caseDetails = await extractSinglePanel('Case Detail');
        console.log(`[CCMS]   Case detail fields: ${Object.keys(caseDetails).length}`);

        const gisCoords = await extractSinglePanel('GIS Coordinate');
        console.log(`[CCMS]   GIS fields: ${Object.keys(gisCoords).length}`);

        const caseInfo = {
            property_information: propertyInfo,
            case_details: caseDetails,
            gis_coordinates: gisCoords,
        };

        // Auto-convert Krutidev
        for (const section of Object.values(caseInfo)) {
            if (typeof section !== 'object' || !section) continue;
            for (const [key, val] of Object.entries(section)) {
                if (typeof val === 'string' && isLikelyKrutidev(val)) {
                    section[key] = autoConvert(val);
                }
            }
        }

        console.log('[CCMS] ✅ Extracted case information.');
        await screenshot('ccms_case_info');
        return caseInfo;

    } catch (err) {
        console.error('[CCMS] extractCaseInformation error:', err.message);
        return {};
    }
}

// ═══════════════════════════════════════════════════════════════
//  WORKFLOW
// ═══════════════════════════════════════════════════════════════

async function extractCCMSWorkflow() {
    const page = bm.getPage();
    if (!page) return [];

    try {
        console.log('[CCMS] === Extracting Workflow ===');

        // Click Workflow tab
        let tab = await page.$(CC.TAB_WORKFLOW);
        if (!tab) {
            const tabs = await page.$x('//a[contains(., "Workflow")]');
            if (tabs.length > 0) tab = tabs[0];
        }
        if (!tab) {
            console.warn('[CCMS] Workflow tab not found.');
            return [];
        }

        const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
        if (!isActive) {
            await tab.click();
            await sleep(2000);
        }

        // Wait for workflow items
        const candidates = [
            '#tab-workflow-panel li',
            'app-workflow ul li',
            'app-workflow li',
            'div[role="tabpanel"] li',
        ];

        let foundSel = null;
        for (const sel of candidates) {
            try {
                await page.waitForSelector(sel, { visible: true, timeout: 8_000 });
                foundSel = sel;
                console.log(`[CCMS] Found workflow items: ${sel}`);
                break;
            } catch (_) { }
        }

        if (!foundSel) {
            console.warn('[CCMS] No workflow items found.');
            return [];
        }

        const timeline = await page.evaluate((sel) => {
            const items = [];
            const lis = document.querySelectorAll(sel);

            lis.forEach((li) => {
                const item = {};

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

                if (!item.process_name && !item.remarks) {
                    const rawText = li.innerText.trim();
                    if (rawText.length > 5) item.raw_text = rawText.substring(0, 300);
                }

                const hasMeaning = item.process_name || item.remarks || item.raw_text;
                if (hasMeaning) items.push(item);
            });

            return items;
        }, foundSel);

        // Auto-convert Krutidev in remarks
        let convertedCount = 0;
        for (const item of timeline) {
            if (item.remarks && isLikelyKrutidev(item.remarks)) {
                item.remarks = autoConvert(item.remarks);
                convertedCount++;
            }
        }
        if (convertedCount > 0) {
            console.log(`[CCMS] 🔄 Auto-converted ${convertedCount} Krutidev remarks.`);
        }

        console.log(`[CCMS] ✅ Extracted ${timeline.length} workflow items.`);
        if (timeline.length > 0) {
            console.log('[CCMS] Workflow preview (first 3):');
            timeline.slice(0, 3).forEach((w, i) => {
                console.log(`  ${i + 1}. ${w.process_name || 'N/A'} [${w.status || ''}]`);
            });
        }

        await screenshot('ccms_workflow');
        return timeline;

    } catch (err) {
        console.error('[CCMS] extractCCMSWorkflow error:', err.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
//  ACTION TAB (select action, type remarks, Save Draft)
// ═══════════════════════════════════════════════════════════════

/**
 * Read available action options from the Action tab dropdown.
 * Returns array of { value, text }.
 */
async function getActionOptions() {
    const page = bm.getPage();
    if (!page) return [];

    try {
        // Click Action tab
        let tab = await page.$(CC.TAB_ACTION);
        if (!tab) {
            const tabs = await page.$x('//a[contains(., "Action")]');
            if (tabs.length > 0) tab = tabs[0];
        }
        if (tab) {
            const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
            if (!isActive) {
                await tab.click();
                await sleep(2000);
            }
        }

        const options = await page.$$eval(CC.ACTION_SELECT + ' option', opts =>
            opts.map(o => ({ value: o.value, text: o.innerText.trim() }))
                .filter(o => o.text !== 'Select...' && o.value && !o.value.includes('undefined'))
        );

        return options;
    } catch (err) {
        console.error('[CCMS] getActionOptions error:', err.message);
        return [];
    }
}

/**
 * Perform an action: select from dropdown, type remarks, click Save Draft.
 * params.actionValue  = value from the dropdown
 * params.remarks      = text for the remarks field
 * params.clickDone    = false (LOCKED — only Save Draft allowed for now)
 */
async function performAction(params = {}) {
    const page = bm.getPage();
    if (!page) return { success: false, error: 'No session' };

    try {
        console.log('[CCMS] === Performing Action ===');

        // Make sure we're on the Action tab
        let tab = await page.$(CC.TAB_ACTION);
        if (!tab) {
            const tabs = await page.$x('//a[contains(., "Action")]');
            if (tabs.length > 0) tab = tabs[0];
        }
        if (tab) {
            const isActive = await page.evaluate(el => el.classList.contains('active'), tab);
            if (!isActive) {
                await tab.click();
                await sleep(2000);
            }
        }

        // Select action from dropdown
        if (params.actionValue) {
            await page.select(CC.ACTION_SELECT, params.actionValue);
            console.log(`[CCMS] ✅ Selected action: ${params.actionValue}`);
            await sleep(1000);
        }

        // Type remarks
        if (params.remarks) {
            const textarea = await page.$(CC.REMARKS_INPUT);
            if (textarea) {
                await textarea.click({ clickCount: 3 });
                await textarea.type(params.remarks);
                console.log(`[CCMS] ✅ Typed remarks: "${params.remarks.substring(0, 50)}..."`);
            }
        }

        // Click Save Draft or Done
        if (params.clickDone) {
            // Find and click Done button
            const doneBtn = await page.evaluateHandle(() => {
                const btns = document.querySelectorAll('button');
                for (const b of btns) {
                    if (/^\s*Done\s*$/i.test(b.innerText)) return b;
                }
                return null;
            });
            const doneEl = doneBtn.asElement();
            if (doneEl) {
                await doneEl.click();
                console.log('[CCMS] ✅ Clicked Done.');
                await sleep(3000);
            } else {
                console.warn('[CCMS] Done button not found.');
            }
        } else {
            // Find and click Save Draft
            const saveDraftBtn = await page.evaluateHandle(() => {
                const btns = document.querySelectorAll('button');
                for (const b of btns) {
                    if (/Save Draft/i.test(b.innerText)) return b;
                }
                return null;
            });
            const saveDraftEl = saveDraftBtn.asElement();
            if (saveDraftEl) {
                await saveDraftEl.click();
                console.log('[CCMS] ✅ Clicked Save Draft.');
                await sleep(3000);
            } else {
                console.warn('[CCMS] Save Draft button not found.');
            }
        }

        await screenshot('ccms_action_done');
        return { success: true, action: params.actionValue, remarks: params.remarks };

    } catch (err) {
        console.error('[CCMS] performAction error:', err.message);
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════
//  FULL CCMS WORKFLOW ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * params = {
 *   actionFilter,    // value for the Action dropdown filter (optional)
 *   sectorFilter,    // value for the Sector dropdown filter (optional)
 *   performAction: { actionValue, remarks } // optional action to perform
 * }
 */
async function runCCMSWorkflow(params = {}) {
    console.log('[CCMS] ════════════ STARTING CCMS WORKFLOW ════════════');
    if (!fs.existsSync(CFG.SCREENSHOT_DIR)) fs.mkdirSync(CFG.SCREENSHOT_DIR, { recursive: true });

    const page = bm.getPage();
    if (!page) return { success: false, error: 'No active session' };

    // Step 1: Navigate to CCMS
    console.log('[CCMS] Step 1: Navigate to CCMS...');
    const navResult = await navigateToCCMS();
    if (!navResult.success) return navResult;

    // Step 2: Apply filters
    console.log('[CCMS] Step 2: Apply filters...');
    await applyCCMSFilters({
        actionValue: params.actionFilter,
        sectorValue: params.sectorFilter,
    });

    // Wait for rows
    try {
        await page.waitForSelector(CC.TASK_LIST_ROWS, { timeout: 15_000 });
    } catch (_) {
        return { success: false, error: 'No rows after filter' };
    }

    // Step 3: Extract table
    console.log('[CCMS] Step 3: Extract table...');
    const tableResult = await extractCCMSTable();
    const firstRow = (tableResult.rows && tableResult.rows.length > 0) ? tableResult.rows[0] : null;
    console.log('[CCMS] First row:', JSON.stringify(firstRow));

    if (!firstRow) {
        return { success: false, error: 'No rows found in CCMS Task List' };
    }

    // Step 4: Open first row
    console.log('[CCMS] Step 4: Open first row...');
    const openResult = await openCCMSRow(0);
    if (!openResult.success) {
        return { ...tableResult, error: 'Failed to open row: ' + openResult.error };
    }

    // Step 5: Heading
    console.log('[CCMS] Step 5: Extract heading...');
    const heading = await extractCCMSHeading();

    // Step 6: Case Information
    console.log('[CCMS] Step 6: Extract case information...');
    const caseInfo = await extractCaseInformation();

    // Step 7: Workflow
    console.log('[CCMS] Step 7: Extract workflow...');
    const workflow = await extractCCMSWorkflow();

    // Step 8: Action (optional)
    let actionResult = null;
    if (params.performAction) {
        console.log('[CCMS] Step 8: Performing action...');
        actionResult = await performAction(params.performAction);
    } else {
        console.log('[CCMS] Step 8: Action skipped (not requested).');
    }

    console.log('[CCMS] ════════════ CCMS WORKFLOW COMPLETE ════════════');
    console.log(`[CCMS] Result: heading="${heading}", workflow=${workflow.length}`);

    return {
        mode: 'ccms',
        heading,
        totalCases: navResult.totalCases,
        filters_used: { action: params.actionFilter, sector: params.sectorFilter },
        first_row: firstRow,
        case_information: caseInfo,
        workflow,
        action_result: actionResult,
    };
}

// ═══════════════════════════════════════════════════════════════
module.exports = {
    navigateToCCMS,
    findCCMSDropdowns,
    applyCCMSFilters,
    extractCCMSTable,
    openCCMSRow,
    extractCCMSHeading,
    extractCaseInformation,
    extractCCMSWorkflow,
    getActionOptions,
    performAction,
    runCCMSWorkflow,
};
