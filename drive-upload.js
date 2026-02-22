const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const TOKEN_PATH = "token.json";
const FOLDER_ID = "1RI9ADYHi-oi2IK7VQDwLYt0e8CUDm5H9";

async function authorize() {
    const credentials = JSON.parse(
        fs.readFileSync("oauth-credentials.json")
    );

    const { client_secret, client_id, redirect_uris } =
        credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    if (fs.existsSync(TOKEN_PATH)) {
        oAuth2Client.setCredentials(
            JSON.parse(fs.readFileSync(TOKEN_PATH))
        );
        return oAuth2Client;
    }

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
    });

    console.log("Authorize this app by visiting:", authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const code = await new Promise((resolve) =>
        rl.question("Enter code from browser: ", resolve)
    );

    rl.close();
    process.stdin.resume(); // Prevent the main run.js loop from exiting

    const token = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(token.tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token.tokens));
    console.log("Token saved.");

    return oAuth2Client;
}

async function uploadToDrive() {
    try {
        const auth = await authorize();
        const drive = google.drive({ version: "v3", auth });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        const folderRes = await drive.files.create({
            resource: {
                name: `Export_${timestamp}`,
                mimeType: "application/vnd.google-apps.folder",
                parents: [FOLDER_ID],
            },
            fields: "id",
        });

        const exportFolderId = folderRes.data.id;

        // Upload JSON
        const jsonPath = path.join(__dirname, "extracted_data.json");
        if (fs.existsSync(jsonPath)) {
            await drive.files.create({
                resource: {
                    name: "extracted_data.json",
                    parents: [exportFolderId],
                },
                media: {
                    mimeType: "application/json",
                    body: fs.createReadStream(jsonPath),
                },
            });
        }

        // Upload downloads
        const downloadsPath = path.join(__dirname, "downloads");
        if (fs.existsSync(downloadsPath)) {
            const files = fs.readdirSync(downloadsPath);

            for (const file of files) {
                const filePath = path.join(downloadsPath, file);

                await drive.files.create({
                    resource: {
                        name: file,
                        parents: [exportFolderId],
                    },
                    media: {
                        body: fs.createReadStream(filePath),
                    },
                });
            }
        }

        console.log("Drive upload completed.");
    } catch (err) {
        console.error("Drive upload failed:", err.message);
    }
}

module.exports = uploadToDrive;
