document.addEventListener('DOMContentLoaded', () => {

    // ── UI Switching ──────────────────────────────────────────────
    const navLinks = document.querySelectorAll('.nav-links li');
    const panels = document.querySelectorAll('.module-panel');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Update Active Nav
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Update Active Panel
            const targetId = link.getAttribute('data-target');
            panels.forEach(p => p.classList.add('hidden'));
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // BP Mode Toggle (Task List vs Proposal List)
    const bpRadios = document.querySelectorAll('input[name="bpMode"]');
    const bpTaskFilters = document.getElementById('bp-task-filters');
    const bpProposalFilters = document.getElementById('bp-proposal-filters');

    bpRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'T') {
                bpTaskFilters.classList.remove('hidden');
                bpProposalFilters.classList.add('hidden');
            } else {
                bpTaskFilters.classList.add('hidden');
                bpProposalFilters.classList.remove('hidden');
            }
        });
    });

    // ── Authentication Flow ───────────────────────────────────────
    const loginOverlay = document.getElementById('login-overlay');
    const step1 = document.getElementById('login-step-1');
    const step2 = document.getElementById('login-step-2');
    const btnStartLogin = document.getElementById('btnStartLogin');
    const btnSubmitCaptcha = document.getElementById('btnSubmitCaptcha');
    const loginError = document.getElementById('loginError');
    const captchaImg = document.getElementById('captchaImg');

    // Password Visibility Toggle
    const togglePassword = document.getElementById('togglePassword');
    const loginPass = document.getElementById('loginPass');

    togglePassword.addEventListener('click', () => {
        const type = loginPass.getAttribute('type') === 'password' ? 'text' : 'password';
        loginPass.setAttribute('type', type);
        togglePassword.classList.toggle('fa-eye');
        togglePassword.classList.toggle('fa-eye-slash');
    });

    function showLoginError(msg) {
        loginError.textContent = msg;
        loginError.classList.remove('hidden');
    }

    // Check if session is already alive
    async function checkSession() {
        try {
            const res = await fetch('/auth/status');
            const data = await res.json();
            if (data.active) {
                loginOverlay.classList.add('hidden');
                logToTerminal('Existing browser session restored.', 'success');
            }
        } catch (e) {
            console.error('Failed to check status');
        }
    }
    checkSession();

    btnStartLogin.addEventListener('click', async () => {
        const username = document.getElementById('loginUser').value;
        const password = document.getElementById('loginPass').value;
        if (!username || !password) return showLoginError('Username and password required');

        btnStartLogin.disabled = true;
        btnStartLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Launching Browser...';
        loginError.classList.add('hidden');

        try {
            const res = await fetch('/auth/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success && data.captchaImage) {
                captchaImg.src = data.captchaImage;
                step1.classList.add('hidden');
                step2.classList.remove('hidden');
                document.getElementById('captchaInput').focus();
            } else {
                showLoginError(data.error || 'Login failed');
                btnStartLogin.disabled = false;
                btnStartLogin.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Connect & Fetch CAPTCHA';
            }
        } catch (e) {
            showLoginError('Network Error. Is the server running?');
            btnStartLogin.disabled = false;
            btnStartLogin.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Connect & Fetch CAPTCHA';
        }
    });

    btnSubmitCaptcha.addEventListener('click', async () => {
        const captchaText = document.getElementById('captchaInput').value;
        if (!captchaText) return showLoginError('Please enter the CAPTCHA');

        btnSubmitCaptcha.disabled = true;
        btnSubmitCaptcha.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
        loginError.classList.add('hidden');

        try {
            const res = await fetch('/auth/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ captchaText })
            });
            const data = await res.json();

            if (data.success) {
                loginOverlay.classList.add('hidden');
                logToTerminal('Authentication successful.', 'success');
            } else {
                showLoginError(data.error || 'CAPTCHA failed. Please reload page to try again.');
                btnSubmitCaptcha.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login & Open Dashboard';
                btnSubmitCaptcha.disabled = false;
            }
        } catch (e) {
            showLoginError('Network Error');
            btnSubmitCaptcha.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login & Open Dashboard';
            btnSubmitCaptcha.disabled = false;
        }
    });

    // Allow Enter key on captcha
    document.getElementById('captchaInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btnSubmitCaptcha.click();
    });

    // ── Terminal Logging ──────────────────────────────────────────
    const terminal = document.getElementById('terminal');

    function logToTerminal(message, type = 'system') {
        const div = document.createElement('div');
        div.className = `log-line ${type}`;
        div.textContent = `> ${message}`;
        terminal.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
    }

    // ── Automation Execution ──────────────────────────────────────
    const btnRunBP = document.getElementById('btnRunBP');
    const btnRunCCMS = document.getElementById('btnRunCCMS');
    const loader = document.getElementById('loader');
    const resultsDataSection = document.getElementById('resultsDataSection');

    async function executeAutomation(endpoint, payload, sourceName) {
        // UI Lock
        btnRunBP.disabled = true;
        btnRunCCMS.disabled = true;
        loader.classList.remove('hidden');
        resultsDataSection.classList.add('hidden');

        logToTerminal(`Initiating ${sourceName} workflow...`, 'info');
        logToTerminal(`Payload: ${JSON.stringify(payload)}`, 'system');

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!result.success) {
                logToTerminal(`Workflow Failed: ${result.error}`, 'error');
                return;
            }

            const data = result.data || result;
            logToTerminal(`Workflow Complete!`, 'success');
            logToTerminal(`Extracted Headline: ${data.heading || 'None'}`, 'success');

            // Update Stats UI
            document.getElementById('statTotalCases').textContent = data.totalCases || '-';
            document.getElementById('statRows').textContent = data.all_rows ? data.all_rows.length : '0';
            resultsDataSection.classList.remove('hidden');

            // Reset browser to dashboard internally
            logToTerminal('Resetting headless browser to Dashboard...', 'system');
            await fetch('/api/dashboard', { method: 'POST' });
            logToTerminal('Browser ready for next task.', 'system');

        } catch (error) {
            logToTerminal(`Network Error: ${error.message}`, 'error');
        } finally {
            // UI Unlock
            btnRunBP.disabled = false;
            btnRunCCMS.disabled = false;
            loader.classList.add('hidden');
        }
    }

    // ── Launch Bindings ───────────────────────────────────────────

    btnRunBP.addEventListener('click', () => {
        const mode = document.querySelector('input[name="bpMode"]:checked').value;
        let endpoint = '';
        let payload = {};

        if (mode === 'T') {
            endpoint = '/api/run-workflow';
            payload = { action: 'Sec Verification' };
            const searchCol = document.getElementById('bpSearchColumn').value;
            const searchKw = document.getElementById('bpSearchKeyword').value;
            if (searchCol) payload.searchColumn = searchCol;
            if (searchKw) payload.searchKeyword = searchKw;
        } else {
            endpoint = '/api/run-proposal';
            payload = {
                fileNo: document.getElementById('bpFileNo').value,
                applicantName: document.getElementById('bpApplicantName').value
            };
        }

        executeAutomation(endpoint, payload, 'Building Permit');
    });

    btnRunCCMS.addEventListener('click', () => {
        const payload = {};

        const actionFilter = document.getElementById('ccmsAction').value;
        const sectorFilter = document.getElementById('ccmsSector').value;

        if (actionFilter) payload.actionFilter = actionFilter;
        if (sectorFilter) payload.sectorFilter = sectorFilter;

        // Perform Action Optional
        const performAction = document.getElementById('ccmsPerformAction').value;
        const remarks = document.getElementById('ccmsRemarks').value;
        const submitPref = document.getElementById('ccmsSubmitPref').value;

        if (performAction || remarks || submitPref !== 'none') {
            payload.performAction = {
                actionValue: performAction,
                remarks: remarks,
                clickDone: submitPref === 'done' ? true : (submitPref === 'draft' ? false : null)
            };
        }

        executeAutomation('/api/run-ccms', payload, 'CCMS');
    });

});
