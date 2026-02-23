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
    BTN_HOME: 'a[routerlink="/private/dashboard"]',

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
        USERNAME: '#username',
        PASSWORD: '#password',
        CAPTCHA_CANVAS: '#captcha',
        CAPTCHA_INPUT: 'input[name="captcha"]',
        SUBMIT_BTN: 'button[type="submit"]',
        DASHBOARD: 'app-dashboard',
    },

    // ── Dashboard Selectors ──────────────────────────────────────
    SEL_DASH: {
        BP_VIEW_MORE: 'a[routerlink="/private/bp-dashboard"], a[href*="bp-dashboard"]',
        TOTAL_CASES: '.border-success.rounded-circle',
    },

    // ── Task List Page Selectors ─────────────────────────────────
    SEL_TASK: {
        // Action dropdown — found dynamically by placeholder text "-Select Action-"
        ACTION_FILTER: null,  // resolved at runtime in building-permit.js
        SEARCH_COLUMN: 'select[name="searchBy"]',
        SEARCH_KEYWORD: 'input[name="searchKeyword"]',
        // Table
        TABLE: 'app-task-list table',
        TABLE_HEADER: 'app-task-list table thead',
        TABLE_ROWS: 'app-task-list table tbody tr',
        ROW_ACTION_BTN: (i) => `app-task-list table tbody tr:nth-child(${i + 1}) td:last-child button`,
    },

    // ── Detail Page Selectors ────────────────────────────────────
    SEL_DETAIL: {
        HEADING: 'strong',
        TAB_WORKFLOW: '#tab-workflow',
        TAB_ATTACHMENT: '#tab-attachment',
        WORKFLOW_ITEMS: 'li',   // inside the workflow panel
        ATTACHMENT_PANELS: 'ngb-accordion .card',
        PANEL_HEADER_BTN: '.card-header button',
        BACK_BUTTON: 'a[href*="bp-dashboard"]',
    },

    // ── Proposal List Selectors ──────────────────────────────────
    SEL_PROPOSAL: {
        // Search form (appears after clicking Search btn)
        SEARCH_BTN: null,  // found dynamically inside the Proposal List card header
        FILE_NO_INPUT: 'input[name="folderNumber"]',
        APPLICANT_INPUT: 'input[name="applicantName"]',
        FIND_BTN: null,  // found dynamically — button with "Find" text
        // Table (inside the Proposal List card)
        TABLE: null,  // found dynamically
        TABLE_ROWS: null,  // found dynamically
        // Modal detail
        MODAL: 'ngb-modal-window',
        MODAL_HEADING: 'ngb-modal-window h1 strong',
        MODAL_TAB_WORKFLOW: 'ngb-modal-window #tab-workflow',
        MODAL_TAB_ATTACHMENT: 'ngb-modal-window #tab-attachment',
        MODAL_WORKFLOW_LI: 'ngb-modal-window app-workflow ul li',
        MODAL_ATTACHMENT_PANELS: 'ngb-modal-window ngb-accordion .card',
    },

    // ── CCMS Dashboard Selectors ──────────────────────────────────
    SEL_CCMS_DASH: {
        VIEW_MORE: 'a[routerlink="/ucms"]',
        TOTAL_CASES: null, // found dynamically — border-primary rounded-circle near CCMS card
    },

    // ── CCMS Detail Page Selectors ──────────────────────────────
    SEL_CCMS: {
        // Tabs
        TAB_CASE_INFO: '#tab-caf',
        TAB_WORKFLOW: '#tab-workflow',
        TAB_ACTION: '#tab-action',
        // Case Information
        PROPERTY_PANEL: null, // found dynamically — panel with "Property Information"
        CASE_DETAIL_PANEL: null, // found dynamically — panel with "Case Details"
        GIS_PANEL: null, // found dynamically — panel with "GIS Coordinates"
        // Action tab
        ACTION_SELECT: 'select#action',
        REMARKS_INPUT: 'textarea#noting',
        SAVE_DRAFT_BTN: null, // found dynamically — button with "Save Draft"
        DONE_BTN: null, // found dynamically — button with "Done" (LOCKED)
        // Task list
        TASK_LIST_TABLE: 'table[listtable]',
        TASK_LIST_ROWS: 'table[listtable] tbody tr',
        ROW_ACTION_BTN: 'td:last-child button',
        // Heading
        HEADING: 'strong',
    },

    // ── Default Filters ──────────────────────────────────────────
    DEFAULT_FILTERS: {
        action: 'Sec Verification',
    },

    // ── Default Proposal Params ──────────────────────────────────
    DEFAULT_PROPOSAL_PARAMS: {
        fileNo: '',
        applicantName: '',
    },
};
