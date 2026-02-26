/**
 * run.js — CLI runner: login, choose module (BP / CCMS), run workflow.
 *
 * Usage:
 *   Terminal 1:  node server.js
 *   Terminal 2:  node run.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const CFG = require('./config');
const uploadToDrive = require('./drive-upload');

function cleanupOldFiles() {
    const jsonPath = path.join(__dirname, "extracted_data.json");
    const downloadsPath = path.join(__dirname, "downloads");

    if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
        console.log("Old extracted_data.json deleted");
    }

    if (fs.existsSync(downloadsPath)) {
        const files = fs.readdirSync(downloadsPath);
        for (const file of files) {
            fs.unlinkSync(path.join(downloadsPath, file));
        }
        console.log("Downloads folder cleared");
    }
}

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

// ─── Main ────────────────────────────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   EASE APP — FULL AUTOMATION                    ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    // ── Readline ─────────────────────────────────────────────────
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

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
            rl.close();
            return;
        }
        console.log('[Login] Credentials entered. CAPTCHA is on screen.');

        const captchaText = (await ask('  Enter CAPTCHA: ')).trim();
        if (!captchaText) {
            console.warn('[Login] No CAPTCHA entered. Retrying…');
            continue;
        }

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
        rl.close();
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MODULE SELECTION (Infinite Loop)
    // ═══════════════════════════════════════════════════════════════
    while (true) {
        console.log('\n┌──────────────────────────────────────┐');
        console.log('│  Choose a module:                    │');
        console.log('│    1 = Building Permit (BP)          │');
        console.log('│    2 = Court Case Management (CCMS)  │');
        console.log('│    0 = Exit Program                  │');
        console.log('└──────────────────────────────────────┘');
        const moduleChoice = (await ask('  Module (0/1/2): ')).trim();

        if (moduleChoice === '0') {
            console.log('Exiting...');
            rl.close();
            return;
        }

        let endpoint, body;

        if (moduleChoice === '2') {
            // ═════════════════════════════════════════════════════════
            //  CCMS FLOW
            // ═════════════════════════════════════════════════════════
            console.log('\n══ Court Case Management System ══');

            // ── Action filter ──
            console.log('\n  Action filter options:');
            console.log('    1. Notice Generation(CCMS)');
            console.log('    2. Order/Notice Letter Signing(CCMS)');
            console.log('    3. Hearing (CCMS)');
            console.log('    4. Intralocatory application');
            console.log('    5. Site Inspection Report by JE');
            console.log('    6. Notice/Order Verification(CCMS)');
            console.log('    0. Skip (no filter)');
            const actionChoice = (await ask('  Select Action (0-6): ')).trim();
            const actionMap = {
                '1': '1850', '2': '1993', '3': '1890',
                '4': '1846', '5': '1881', '6': '1853',
            };
            const actionFilter = actionMap[actionChoice] || '';

            // ── Sector filter ──
            console.log('\n  Sector filter options:');
            console.log('    1.  Bhadrabad Left Hand Side of Haridwar-Delhi New Highway');
            console.log('    2.  Bhadrabad Outer Nagar Nigam');
            console.log('    3.  Bhadrabad Right Hand Side of Haridwar-Delhi New Highway');
            console.log('    4.  Bhadrabad Under Nagar Nigam');
            console.log('    5.  Bhagwanpur Left Hand Side of Roorkee-Dehradun Highway');
            console.log('    6.  Bhagwanpur Right Hand Side of Roorkee-Dehradun Highway');
            console.log('    7.  Bhupatwala');
            console.log('    8.  Haridwar');
            console.log('    9.  Jwalapur Outer Nagar Nigam');
            console.log('    10. Jwalapur Under Nagar Nigam');
            console.log('    11. Kankhal Outer Nagar Nigam');
            console.log('    12. Kankhal Under Nagar Nigam');
            console.log('    13. Laksar');
            console.log('    14. Mayapur');
            console.log('    15. Roorkee Civil Lines');
            console.log('    16. Roorkee Left Hand Side of Haridwar-Delhi New Highway');
            console.log('    17. Roorkee Right Hand Side of Haridwar-Delhi New Highway');
            console.log('    18. Saptsarowar');
            console.log('    0.  Skip (no filter)');
            const sectorChoice = (await ask('  Select Sector (0-18): ')).trim();
            const sectorMap = {
                '1': 'HRDA-017', '2': 'HRDA-014', '3': 'HRDA-018',
                '4': 'HRDA-005', '5': 'HRDA-012', '6': 'HRDA-016',
                '7': 'HRDA-008', '8': 'HRDA-002', '9': 'HRDA-004',
                '10': 'HRDA-003', '11': 'HRDA-007', '12': 'HRDA-006',
                '13': 'HRDA-013', '14': 'HRDA-001', '15': 'HRDA-015',
                '16': 'HRDA-011', '17': 'HRDA-010', '18': 'HRDA-009',
            };
            const sectorFilter = sectorMap[sectorChoice] || '';

            body = {};
            if (actionFilter) body.actionFilter = actionFilter;
            if (sectorFilter) body.sectorFilter = sectorFilter;

            // ── Action tab (optional) ──
            const wantAction = (await ask('\n  Perform action on the case? (Y/N): ')).trim().toUpperCase();
            if (wantAction === 'Y') {
                console.log('\n  Action options:');
                console.log('    1.  Seal Property');
                console.log('    2.  Demolish Property');
                console.log('    3.  Compounding');
                console.log('    4.  Next Hearing Date');
                console.log('    5.  Close Case');
                console.log('    6.  Demolish - Show Cause');
                console.log('    7.  Seal - Show Cause');
                console.log('    8.  Inspection');
                console.log('    9.  Intrim order');
                console.log('    10. Final order');
                console.log('    11. Stay Order');
                console.log('    12. Drop Case');
                console.log('    0.  Skip (Just Remarks/Buttons)');
                const caseActionChoice = (await ask('  Select action (0-12): ')).trim();
                const caseActionMap = {
                    '1': '410', '2': '420', '3': '430', '4': '440',
                    '5': '450', '6': '460', '7': '470', '8': '471',
                    '9': '473', '10': '474', '11': '500', '12': '510',
                };
                const actionValue = caseActionMap[caseActionChoice] || '';

                const remarks = (await ask('  Enter Remarks/Comment (or press Enter to skip): ')).trim();

                console.log('\n  Action Submit Preference:');
                console.log('    1. Click "Done"');
                console.log('    2. Click "Save Draft"');
                console.log('    0. Do not click anything');
                const actionSubmitChoice = (await ask('  Select Submit (0-2): ')).trim();

                // Only actually put `clickDone` config in if they pressed 1 or 2
                let clickDone = null;
                if (actionSubmitChoice === '1') clickDone = true;
                if (actionSubmitChoice === '2') clickDone = false;

                // Only attach performAction if AT LEAST ONE of these was provided
                if (actionValue || remarks || clickDone !== null) {
                    body.performAction = { actionValue, remarks, clickDone };
                }
            }

            endpoint = '/api/run-ccms';
            console.log(`\n  CCMS Params: ${JSON.stringify(body)}`);

        } else {
            // ═════════════════════════════════════════════════════════
            //  BUILDING PERMIT FLOW
            // ═════════════════════════════════════════════════════════
            console.log('\n══ Building Permit ══');
            console.log('\n┌──────────────────────────────────────┐');
            console.log('│  Choose BP mode:                     │');
            console.log('│    T = Task List                     │');
            console.log('│    P = Proposal List                 │');
            console.log('└──────────────────────────────────────┘');
            const bpMode = (await ask('  Mode (T/P): ')).trim().toUpperCase();

            if (bpMode === 'P') {
                console.log('\n── Proposal List Mode ──');
                const fileNo = (await ask('  File No (or press Enter to skip): ')).trim();
                const applicantName = (await ask('  Applicant Name (or press Enter to skip): ')).trim();
                endpoint = '/api/run-proposal';
                body = { fileNo, applicantName };
            } else {
                console.log('\n── Task List Mode ──');
                console.log('  Action filter: "Sec Verification" (fixed)');

                console.log('\n  Search By Column options:');
                console.log('    1. Application No');
                console.log('    2. File No');
                console.log('    3. Assigned Date');
                console.log('    4. Applicant Name');
                console.log('    5. Status');
                console.log('    0. Skip (Just normal extraction)');
                const searchColumnChoice = (await ask('  Select Column (0-5): ')).trim();
                const searchColumnMap = {
                    '1': '1: customFolderNumber',
                    '2': '2: referenceFile',
                    '3': '3: scheduleDate',
                    '4': '4: applicantName',
                    '5': '5: statusDesc',
                };
                const searchColumn = searchColumnMap[searchColumnChoice];

                const searchKeyword = (await ask('  Search Keyword (or press Enter to skip): ')).trim();

                endpoint = '/api/run-workflow';
                body = { action: 'Sec Verification' };
                if (searchColumn) body.searchColumn = searchColumn;
                if (searchKeyword) body.searchKeyword = searchKeyword;
            }
            console.log(`\n  Params: ${JSON.stringify(body)}`);
        }

        // ═══════════════════════════════════════════════════════════════
        //  RUN
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── RUNNING WORKFLOW ──');
        cleanupOldFiles();

        try {
            const res = await request('POST', endpoint, body);

            if (res.data.success === false) {
                console.error('\n❌ Workflow failed:', res.data.error);
                continue; // Loop back to main menu
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

            // CCMS: Case Information
            if (data.case_information) {
                const ci = data.case_information;
                if (ci.property_information && Object.keys(ci.property_information).length > 0) {
                    console.log('\n── Property Information ──');
                    for (const [k, v] of Object.entries(ci.property_information)) {
                        if (v) console.log(`  ${k.padEnd(22)}: ${v}`);
                    }
                }
                if (ci.case_details && Object.keys(ci.case_details).length > 0) {
                    console.log('\n── Case Details ──');
                    for (const [k, v] of Object.entries(ci.case_details)) {
                        if (v) console.log(`  ${k.padEnd(30)}: ${v.substring(0, 80)}`);
                    }
                }
                if (ci.gis_coordinates && Object.keys(ci.gis_coordinates).length > 0) {
                    console.log('\n── GIS Coordinates ──');
                    for (const [k, v] of Object.entries(ci.gis_coordinates)) {
                        if (v) console.log(`  ${k.padEnd(12)}: ${v}`);
                    }
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

            // CCMS: Action result
            if (data.action_result) {
                console.log('\n── Action Result ──');
                console.log(`  Success: ${data.action_result.success}`);
                if (data.action_result.action) console.log(`  Action: ${data.action_result.action}`);
                if (data.action_result.remarks) console.log(`  Remarks: ${data.action_result.remarks}`);
            }

            // BP: Attachments
            const files = data.attachments?.files || [];
            if (files.length > 0) {
                console.log(`\n── Attachments: ${files.length} files ──`);
                files.forEach(f => console.log(`  • ${f}`));
            }

            // Save to disk
            fs.writeFileSync(CFG.OUTPUT_FILE, JSON.stringify(data, null, 2));
            console.log(`\n✅ Full data saved to: ${CFG.OUTPUT_FILE}`);

            console.log('\n── Uploading to Google Drive ──');
            await uploadToDrive();

            console.log('\n── Resetting Browser to Dashboard ──');
            await request('POST', '/api/dashboard');

            console.log('\nPress Enter to return to the main menu...');
            await ask(''); // Wait for user acknowledgment

        } catch (err) {
            console.error('\n❌ Workflow request error:', err.message);
            console.log('Make sure server.js is running (node server.js)');
            console.log('\nPress Enter to return to the main menu...');
            await ask(''); // Wait for user acknowledgment
        }
    } // End of while(true) loop
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
