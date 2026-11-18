const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config({ quiet: true });

const { respostaPara } = require("./bot/respostas");

const app = express();

// A Railway fica atrás de um proxy: isso faz req.ip trazer o IP real do visitante.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  express.json({
    limit: "20kb",
    // Guarda o corpo bruto para validar a assinatura do webhook da Meta
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "20kb" }));

// ==========================
// CONFIGURAÇÃO
// ==========================
const PORT = process.env.PORT || 8080;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// WhatsApp Cloud API
const TOKEN = process.env.TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET; // opcional: valida que o webhook veio mesmo da Meta
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v26.0";

// Onde os leads ficam salvos. Na Railway, crie um Volume: a variável
// RAILWAY_VOLUME_MOUNT_PATH é preenchida automaticamente e os dados sobrevivem a redeploys.
const DATA_DIR =
  process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const AGENDAMENTOS_FILE = path.join(DATA_DIR, "agendamentos.json");

// ==========================
// ARMAZENAMENTO (JSON)
// ==========================
function ensureDataFile(filePath) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
}

function readJsonArray(filePath) {
  ensureDataFile(filePath);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Erro lendo ${filePath}:`, error.message);
    return [];
  }
}

// Escreve num arquivo temporário e renomeia: se o servidor cair no meio, o JSON não corrompe.
function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function saveRecord(filePath, fields, req) {
  const records = readJsonArray(filePath);
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...fields,
    // metadados vêm depois para um campo vazio não apagar o valor padrão
    page: fields.page || clean(req.get("referer"), 300) || "Não informado",
    source: fields.source || "site",
    ip: req.ip || "Não informado",
    userAgent: clean(req.get("user-agent"), 300) || "Não informado",
  };

  records.unshift(record);
  writeJsonAtomic(filePath, records);
  return record;
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

// ==========================
// LIMITE DE ENVIOS (anti-spam simples, em memória)
// ==========================
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const RATE_MAX = 10; // envios por IP nessa janela
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "desconhecido";
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);

  if (recent.length >= RATE_MAX) {
    return res
      .status(429)
      .json({ ok: false, message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  recent.push(now);
  hits.set(key, recent);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(key);
  }
}, RATE_WINDOW_MS).unref();

// ==========================
// CAPTURA DE LEADS DO SITE
// ==========================
app.post("/api/leads", rateLimit, (req, res) => {
  const contact = clean(req.body.contact, 120);
  const phoneDigits = onlyDigits(contact);

  if (!contact) {
    return res.status(400).json({ ok: false, message: "Informe e-mail ou WhatsApp." });
  }

  const email = isValidEmail(contact);
  if (!email && (phoneDigits.length < 10 || phoneDigits.length > 13)) {
    return res.status(400).json({ ok: false, message: "Informe um e-mail válido ou WhatsApp com DDD." });
  }

  const record = saveRecord(
    LEADS_FILE,
    {
      contact,
      contactType: email ? "email" : "whatsapp",
      page: clean(req.body.page, 300),
      source: clean(req.body.source, 60) || "popup_contato",
    },
    req
  );

  res.status(201).json({ ok: true, message: "Lead salvo com sucesso.", id: record.id });
});

app.post("/api/agendamentos", rateLimit, (req, res) => {
  const nome = clean(req.body.nome, 120);
  const telefone = clean(req.body.telefone, 30);
  const email = clean(req.body.email, 120);
  const servico = clean(req.body.servico, 60);

  if (!nome || !telefone || !email || !servico) {
    return res.status(400).json({ ok: false, message: "Preencha nome, telefone, e-mail e serviço." });
  }

  const digits = onlyDigits(telefone);
  if (digits.length < 10 || digits.length > 13) {
    return res.status(400).json({ ok: false, message: "Informe telefone/WhatsApp com DDD." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Informe um e-mail válido." });
  }

  const record = saveRecord(
    AGENDAMENTOS_FILE,
    {
      nome,
      telefone,
      email,
      servico,
      data: clean(req.body.data, 20) || "A combinar",
      horario: clean(req.body.horario, 30) || "A combinar",
      mensagem: clean(req.body.mensagem, 2000) || "Sem mensagem adicional",
      page: clean(req.body.page, 300),
      source: clean(req.body.source, 60) || "formulario_agendamento",
    },
    req
  );

  res.status(201).json({ ok: true, message: "Agendamento salvo com sucesso.", id: record.id });
});

// ==========================
// PAINEL ADMIN
// ==========================
function tokenMatches(provided) {
  if (!ADMIN_TOKEN || typeof provided !== "string" || !provided) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(ADMIN_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

app.get("/api/admin/leads", (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!ADMIN_TOKEN) {
    return res.status(403).json({
      ok: false,
      message: "Configure a variável ADMIN_TOKEN na Railway para liberar o painel de leads.",
    });
  }

  // O token vai no cabeçalho (não na URL) para não aparecer em logs e no histórico do navegador.
  if (!tokenMatches(req.get("x-admin-token"))) {
    return res.status(401).json({ ok: false, message: "Token inválido." });
  }

  res.json({
    ok: true,
    leads: readJsonArray(LEADS_FILE),
    agendamentos: readJsonArray(AGENDAMENTOS_FILE),
  });
});

// ==========================
// WHATSAPP CLOUD API (WEBHOOK)
// ==========================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

function assinaturaValida(req) {
  if (!APP_SECRET) return true; // sem APP_SECRET configurado, não valida
  const header = req.get("x-hub-signature-256") || "";
  const esperado =
    "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody || "").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function enviarMensagem(to, body) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body } },
    {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      timeout: 10000,
    }
  );
}

app.post("/webhook", (req, res) => {
  if (!assinaturaValida(req)) return res.sendStatus(401);

  // Responde 200 na hora: se demorar ou der erro, a Meta reenvia o mesmo evento várias vezes.
  res.sendStatus(200);

  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn("Webhook recebido, mas TOKEN/PHONE_NUMBER_ID não estão configurados.");
    return;
  }

  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        const reply = respostaPara(message.text?.body || "");
        enviarMensagem(message.from, reply).catch((error) => {
          console.error("Erro ao responder no WhatsApp:", error.response?.data || error.message);
        });
      }
    }
  }
});

// ==========================
// SITE (arquivos estáticos)
// ==========================
app.get("/health", (_req, res) => res.json({ ok: true }));

// extensions: permite abrir /sobre além de /sobre.html
app.use(express.static(path.join(__dirname, "front"), { extensions: ["html"] }));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, message: "Rota não encontrada." });
  }
  res.status(404).sendFile(path.join(__dirname, "front", "404.html"));
});

// Erros (ex.: JSON inválido no corpo) viram resposta limpa, sem stack trace
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (req.path.startsWith("/api/") || req.path === "/webhook") {
    return res.status(status).json({ ok: false, message: "Requisição inválida." });
  }
  res.status(status).send("Erro no servidor.");
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Dados salvos em: ${DATA_DIR}`);
});
