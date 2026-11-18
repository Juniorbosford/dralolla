/**
 * Simulador do bot no terminal — útil para testar as respostas sem o WhatsApp.
 * Uso: npm run bot:cli   (digite "sair" para encerrar)
 */
require("dotenv").config({ quiet: true });
const readline = require("readline-sync");
const { respostaPara, MENU } = require("./bot/respostas");

console.log(MENU);

while (true) {
  const entrada = readline.question("\nVocê: ");
  if (["sair", "exit", "q"].includes(entrada.trim().toLowerCase())) break;
  console.log(`\nBot: ${respostaPara(entrada)}`);
}
