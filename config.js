/**
 * config.js — Central configuration for the BP automation.
 * All selectors, credentials, timeouts, and paths live here.
 */

const path = require('path');

module.exports = {

    // ── Credentials ──────────────────────────────────────────────
    USERNAME: 'H202',
    PASSWORD: 'ShivHari@121',

    // ── URLs ─────────────────────────────────────────────────────
    LOGIN_URL: 'https://uhudaeaseapp.uk.gov.in/easeapp/',
    DASHBOARD_URL: 'https://uhudaeaseapp.uk.gov.in/easeapp/private',

    // ── Timeouts (ms) ────────────────────────────────────────────
    NAV_TIMEOUT: 120_000,   // slow gov site
    ELEMENT_TIMEOUT: 60_000,
    SHORT_WAIT: 2_000,
    DOWNLOAD_TIMEOUT: 30_000,
    MAX_CAPTCHA_RETRIES: 3,

    // ── Server ───────────────────────────────────────────────────
    SERVER_PORT: 3000,
    SERVER_HOST: '127.0.0.1',

    // ── Paths ────────────────────────────────────────────────────
    DOWNLOAD_DIR: path.resolve(__dirname, 'downloads'),
    SCREENSHOT_DIR: path.resolve(__dirname, 'screenshots'),
    OUTPUT_FILE: path.resolve(__dirname, 'extracted_data.json'),
    ENG_TRAINED_DATA: path.resolve(__dirname, 'eng.traineddata'),

    // ── Login Selectors ──────────────────────────────────────────
    SEL_LOGIN: {
        USERNAME:       '#username',
        PASSWORD:       '#password',
        CAPTCHA_CANVAS: '#captcha',
        CAPTCHA_INPUT:  'input[name="captcha"]',
        SUBMIT_BTN:     'button[type="submit"]',
        DASHBOARD:      'app-dashboard',
    },

    // ── Dashboard Selectors ──────────────────────────────────────
    SEL_DASH: {
        BP_VIEW_MORE: 'a[routerlink="/private/bp-dashboard"], a[href*="bp-dashboard"]',
        TOTAL_CASES:  '.border-success.rounded-circle',
    },

    // ── Task List Page Selectors ─────────────────────────────────
    SEL_TASK: {
        // Action dropdown — found dynamically by placeholder text "-Select Action-"
        ACTION_FILTER:     null,  // resolved at runtime in building-permit.js
        SEARCH_COLUMN:     'select[name="searchBy"]',
        SEARCH_KEYWORD:    'input[name="searchKeyword"]',
        // Table
        TABLE:             'app-task-list table',
        TABLE_HEADER:      'app-task-list table thead',
        TABLE_ROWS:        'app-task-list table tbody tr',
        ROW_ACTION_BTN:    (i) => `app-task-list table tbody tr:nth-child(${i + 1}) td:last-child button`,
    },

    // ── Detail Page Selectors ────────────────────────────────────
    SEL_DETAIL: {
        HEADING:            'strong',
        TAB_WORKFLOW:       '#tab-workflow',
        TAB_ATTACHMENT:     '#tab-attachment',
        WORKFLOW_ITEMS:     'li',   // inside the workflow panel
        ATTACHMENT_PANELS:  'ngb-accordion .card',
        PANEL_HEADER_BTN:   '.card-header button',
        BACK_BUTTON:        'a[href*="bp-dashboard"]',
    },

    // ── Default Filters ──────────────────────────────────────────
    DEFAULT_FILTERS: {
        action: 'Sec Verification',
    },
};
