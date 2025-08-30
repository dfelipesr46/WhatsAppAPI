// server.js
import "dotenv/config.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { appendRow, ensureHeaders } from "./src/sheets.js";
import { sendText, sendTemplate } from "./src/whatsapp.js";
import path from "path";

const app = express();
const __dirname = path.resolve();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "verify_token_demo";

// Inicializa headers en Sheets (si no existen)
(async () => {
  try {
    await ensureHeaders("Respuestas", [
      "Fecha/Hora (Bogotá)",
      "wa_id",
      "Nombre",
      "Tipo",
      "Mensaje",
      "Message ID",
      "Raw"
    ]);
    await ensureHeaders("Estados", [
      "Fecha/Hora (Bogotá)",
      "wa_id",
      "Status",
      "Message ID",
      "Conversation ID",
      "Category",
      "Pricing Model",
      "Error Code",
      "Raw"
    ]);
    console.log("✅ Google Sheets listo.");
  } catch (e) {
    console.warn("⚠️ No se pudo preparar Sheets (se intentará al recibir eventos):", e.message);
  }
})();

// servir archivos estáticos desde /static
app.use("/static", express.static(path.join(__dirname, "public"), {
  maxAge: "1d",             // cache (opcional)
  setHeaders: (res, path) => {
    // forzar content-type correcto si hace falta
    if (path.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
  }
}));

app.use(express.json({ limit: "2mb" })); // cuidado con body limit para requests
// ... tus middlewares y rutas existentes ...

// Salud
app.get("/healthz", (_, res) => res.status(200).send("ok"));

// Verificación del webhook (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recepción de webhooks (POST)
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    // Siempre responder rápido a Meta
    res.sendStatus(200);

    if (payload.object !== "whatsapp_business_account") return;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Mensajes entrantes (clientes te hablan)
        if (value.messages) {
          for (const msg of value.messages) {
            const from = msg.from; // wa_id
            const messageId = msg.id;
            const type = msg.type;

            // Extraer texto de distintos tipos
            let text = "";
            if (type === "text") {
              text = msg.text?.body || "";
            } else if (type === "interactive") {
              const i = msg.interactive;
              text =
                i?.button_reply?.title ||
                i?.list_reply?.title ||
                JSON.stringify(i);
            } else {
              text = JSON.stringify(msg[type] || {});
            }

            const contactName = value.contacts?.[0]?.profile?.name || "";
            const ts = new Date().toLocaleString("es-CO", {
              timeZone: "America/Bogota",
              hour12: false
            });

            // Guarda en Google Sheets (pestaña "Respuestas")
            await appendRow("Respuestas", [
              ts,
              from,
              contactName,
              type,
              text,
              messageId,
              JSON.stringify(msg)
            ]);

            console.log(`📩 Msg de ${from} (${contactName}): ${text}`);
          }
        }

        // Estados de entrega/lectura
        if (value.statuses) {
          for (const st of value.statuses) {
            const from = st.recipient_id; // wa_id
            const status = st.status;     // sent, delivered, read, failed
            const messageId = st.id;
            const conversationId = st.conversation?.id || "";
            const category = st.conversation?.origin?.type || "";
            const pricingModel = st.pricing?.pricing_model || "";
            const errorCode = st.errors?.[0]?.code || "";

            const ts = new Date().toLocaleString("es-CO", {
              timeZone: "America/Bogota",
              hour12: false
            });

            await appendRow("Estados", [
              ts,
              from,
              status,
              messageId,
              conversationId,
              category,
              pricingModel,
              errorCode,
              JSON.stringify(st)
            ]);

            console.log(`🗂️ Status ${status} para ${from} (msg ${messageId})`);
          }
        }
      }
    }
  } catch (err) {
    // Nunca fallar el 200 a Meta; loguear a parte
    console.error("❌ Error procesando webhook:", err.message);
  }
});

// Endpoint opcional para responder manualmente (texto libre dentro de 24h)
app.post("/send-text", async (req, res) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: "Falta to o body" });
    const data = await sendText(to, body);
    res.json(data);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json(e.response?.data || { error: e.message });
  }
});

// Endpoint opcional para enviar una plantilla
app.post("/send-template", async (req, res) => {
  try {
    const { to, name, languageCode = "es_CO", components } = req.body;
    if (!to || !name) return res.status(400).json({ error: "Falta to o name" });
    const data = await sendTemplate(to, name, languageCode, components);
    res.json(data);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json(e.response?.data || { error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server escuchando en :${PORT}`);
});
