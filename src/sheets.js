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

function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

export async function appendRow(sheetName, values) {
  const sheets = getSheets();
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
  const sheets = getSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });

  const row = res.data.values?.[0] || [];
  if (row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }
}

/**
 * Actualiza una fila en la hoja por `messageId`.
 * @param {string} sheetName - Nombre de la hoja (ej. "Hoja1")
 * @param {string} messageId - ID del mensaje de WhatsApp
 * @param {function} updateFn - Función que recibe un objeto {columna: valor} y devuelve el actualizado
 */

export async function updateRowByMessageId(messageId, updates) {
  try {
    console.log(`🔍 Buscando fila con ID Mensaje = ${messageId}`);
    const sheets = getSheets();
    const spreadsheetId = process.env.SPREADSHEET_ENVIOS_MASIVOS_ID;

    if (!spreadsheetId) {
      throw new Error("❌ Falta SPREADSHEET_ENVIOS_MASIVOS_ID en variables de entorno.");
    }

    const sheetName = "Hoja1"; // fijo según tu estructura

    // 1. Leer todas las filas
    console.log(`📥 Leyendo datos de ${sheetName}...`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}`,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.log("⚠️ La hoja está vacía.");
      return;
    }

    // 2. Buscar cabeceras
    const headers = rows[0];
    const messageIdIndex = headers.indexOf("ID Mensaje");
    if (messageIdIndex === -1) {
      throw new Error("❌ No se encontró la columna 'ID Mensaje'");
    }

    // 3. Localizar fila
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][messageIdIndex] === messageId) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      console.log(`⚠️ No se encontró el messageId ${messageId} en la hoja.`);
      return;
    }

    console.log(`✅ Fila encontrada en la fila ${rowIndex + 1}`);

    // 4. Crear objeto clave-valor
    const rowData = {};
    headers.forEach((h, idx) => {
      rowData[h] = rows[rowIndex][idx] || "";
    });

    // 5. Aplicar cambios
    const updatedRow = { ...rowData, ...updates };

    // 6. Reconstruir valores
    const newValues = headers.map((h) => updatedRow[h] || "");

    // 7. Actualizar en Sheets
    const range = `${sheetName}!A${rowIndex + 1}:${String.fromCharCode(
      65 + headers.length - 1
    )}${rowIndex + 1}`;

    console.log(`✍️ Actualizando fila ${rowIndex + 1} con:`, updates);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newValues],
      },
    });

    console.log(`✅ Fila actualizada en ${sheetName} (row ${rowIndex + 1})`);
  } catch (err) {
    console.error("❌ Error en updateRowByMessageId:", err.message);
  }
}
