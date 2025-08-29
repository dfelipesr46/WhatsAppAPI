// whatsapp.js
import axios from "axios";

const API_VERSION = process.env.API_VERSION || "v22.0";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_TOKEN = process.env.WABA_TOKEN;

if (!PHONE_NUMBER_ID || !WABA_TOKEN) {
  console.warn("⚠️ Falta PHONE_NUMBER_ID o WABA_TOKEN en variables de entorno.");
}

const api = axios.create({
  baseURL: `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${WABA_TOKEN}`,
    "Content-Type": "application/json",
  },
});

export async function sendText(to, body) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };
  const { data } = await api.post("/messages", payload);
  return data;
}

export async function sendTemplate(to, name, languageCode = "es_CO", components) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: languageCode },
    },
  };
  if (components) payload.template.components = components;
  const { data } = await api.post("/messages", payload);
  return data;
}
