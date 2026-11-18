/**
 * Respostas do bot da clínica.
 * Usado tanto pelo webhook do WhatsApp (index.js) quanto pelo bot de terminal (bot-cli.js),
 * assim os dois sempre respondem a mesma coisa.
 */

const ENDERECO = "Rua Barão de Souza Leão, 195 - Boa Viagem, Recife - PE";
const LINK_MAPS = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ENDERECO)}`;

function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "";
}

function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos: "olá" -> "ola"
    .trim()
    .toLowerCase();
}

const MENU =
  "👋 Olá! Bem-vindo(a) à Clínica Dra. Lolla.\n\n" +
  "1️⃣ Agendar avaliação\n" +
  "2️⃣ Procedimentos\n" +
  "3️⃣ Localização\n" +
  "4️⃣ Falar com atendente\n\n" +
  "Responda com o número da opção.";

function respostaPara(textoRecebido) {
  const texto = normalizar(textoRecebido);
  const site = siteUrl();

  if (["oi", "ola", "menu", "inicio", "bom dia", "boa tarde", "boa noite"].includes(texto)) {
    return MENU;
  }

  if (texto === "1") {
    return (
      "📅 Para agendar sua avaliação, envie aqui:\n" +
      "• Seu nome\n• Procedimento de interesse\n• Melhor dia e horário" +
      (site ? `\n\nSe preferir, agende pelo site: ${site}/agendamento.html` : "")
    );
  }

  if (texto === "2") {
    return (
      "💉 Procedimentos:\n" +
      "• Harmonização glútea\n" +
      "• Harmonização facial, labial e íntima\n" +
      "• Botox e preenchimento\n" +
      "• Tratamentos corporais (drenagem, detox, celulite, modelagem)\n" +
      "• Tecnologias: lipo sem corte, radiofrequência, ultrassom microfocado e endolaser" +
      (site ? `\n\nVeja todos os detalhes: ${site}/servicos.html` : "")
    );
  }

  if (texto === "3") {
    return `📍 ${ENDERECO}\n${LINK_MAPS}`;
  }

  if (texto === "4") {
    return "👩‍💼 Certo! Uma atendente vai falar com você em breve.";
  }

  return "Digite *menu* para ver as opções.";
}

module.exports = { respostaPara, MENU, ENDERECO, LINK_MAPS };
