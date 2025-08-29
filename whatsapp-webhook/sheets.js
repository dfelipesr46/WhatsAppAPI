// sheets.js
import { google } from "googleapis";

function loadServiceAccount() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let creds;
  if (b64 && b64.trim() !== "") {
    const json = Buffer.from(b64, "base64").toString("utf8");
    creds = JSON.parse(json);
  } else if (raw && raw.trim() !== "") {
    creds = JSON.parse(raw);
  } else {
    throw new Error("No se encontraron credenciales del Service Account (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 o GOOGLE_SERVICE_ACCOUNT_JSON).");
  }
  return creds;
}

function getAuth() {
  const creds = loadServiceAccount();
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  return new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    scopes
  );
}

export async function appendRow(sheetName, values) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Falta SPREADSHEET_ID en variables de entorno.");

  const range = `${sheetName}!A:Z`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values],
    },
  });
}

export async function ensureHeaders(sheetName, headers) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SPREADSHEET_ID;

  // Lee la primera fila
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });

  const row = res.data.values?.[0] || [];
  if (row.length === 0) {
    // Escribe headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }
}
