# Automagic Scraper 🤖

A robust, fully automated Node.js and Puppeteer toolset for scraping specialized government portals, specifically tailored for the **Building Permit (BP)** system and the **Court Case Management System (CCMS)**.

Features a sleek, dark-themed, browser-based dashboard for easy execution, complete with an integrated terminal, robust authentication handling, Automatic Krutidev-to-Unicode font translation, and Google Drive auto-uploads.

---

## 🏗️ Core Features

- **Modern Web Dashboard:** Launch workflows and monitor real-time extraction logs straight from your browser.
- **Automated Authentication:** Two-step login overlay securely passes credentials to a headless browser and uses live screenshots for manual CAPTCHA solving.
- **Module 1: Building Permit (BP)** 
  - Iterates through the BP task list based on dynamic search filters.
  - Extracts property details, workflows, headings, and forcefully downloads all associated attachments.
- **Module 2: Court Case Management (CCMS)**
  - Select Action & Sector filters dynamically.
  - Gracefully slices through complex, animated Angular component trees to extract Case Information, Property Details, GIS Coordinates, and Workflow history.
- **Auto Krutidev Translation:** Automatically detects legacy Hindi Krutidev fonts (commonly found in `Defendent` and `Remarks` columns) and maps them to standard Unicode Hindi.
- **Google Drive Auto-sync:** Zips up the resulting `extracted_data.json` and all downloaded attachments and pushes them seamlessly to a predefined Google Drive folder via OAuth2.

---

## ⚙️ Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- A Google Cloud Project with the **Google Drive API** enabled (if you want Auto-sync).

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/raydennnnn/bp-automation.git
   cd bp-automation
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the environment:**
   Open `config.js` and populate the necessary targets:
   - `LOGIN_URL`: The URL of the portal login page.
   - Credentials (if hardcoding, though the UI supports manual entry).
   - Relevant DOM selectors if the government updates their site structure.

4. **Setup Google Drive Uploads (Optional):**
   - Provide an `oauth-credentials.json` file in the root directory containing your Google Cloud OAuth 2.0 Client IDs.
   - On the first run, the terminal will prompt you to authorize the app via a URL.

---

## 🚀 Usage

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Open the Dashboard:**
   Navigate your web browser to:
   ```
   http://localhost:3000
   ```

3. **Log In:**
   - Enter your portal credentials into the Automagic Login overlay.
   - The server will deploy Puppeteer in the background. 
   - A CAPTCHA image will appear in your browser. Solve it to initialize the session.

4. **Run a Workflow:**
   - Select either the **Building Permit** or **CCMS** module from the left sidebar.
   - Configure your parameters (Search Filters, Sector, Action, etc.).
   - Hit **Execute**, and watch the magic unfold in the animated terminal.

---

## 📂 Project Structure

```text
├── public/                 # Web Dashboard Frontend
│   ├── index.html          # UI Layout & Modals
│   ├── style.css           # Premium Dark Theme & Glassmorphism
│   └── app.js              # Client-Side API bindings & Terminal Drawer
├── server.js               # Express Backend + Orchestrator
├── browser-manager.js      # Puppeteer Lifecycle Management
├── auth.js                 # Headless Login & CAPTCHA Capture Handling
├── bp.js                   # Building Permit Target Workflows
├── court-case.js           # CCMS Target Workflows
├── krutidev-converter.js   # Legacy Font Translation Engine
├── drive-upload.js         # OAuth2 Google Drive Exporter
└── config.js               # Global Configuration & DOM Selectors
```

---

*Note: This script strictly interfaces with the DOM structures present at the time of authoring. If the portal's HTML framework changes, the selectors in `config.js`, `bp.js`, or `court-case.js` will need to be updated accordingly.*
