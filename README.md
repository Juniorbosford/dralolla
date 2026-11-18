# Clínica Dra. Lolla — Site + Leads + Bot de WhatsApp

Site institucional da Clínica Dra. Lolla (estética / harmonização glútea, Recife-PE), servido por um backend Node.js/Express que também:

- salva os contatos do **popup** e do **formulário de agendamento**;
- mostra esses dados num **painel protegido por token** (`/admin-leads.html`);
- responde mensagens no **WhatsApp** via Cloud API da Meta (webhook).

## Estrutura

```
index.js            servidor Express (API + site estático + webhook do WhatsApp)
bot/respostas.js    textos/menu do bot (usado pelo webhook e pelo bot de terminal)
bot-cli.js          simulador do bot no terminal (npm run bot:cli)
front/              site (HTML, CSS, JS, imagens) — tudo aqui é público
data/               leads e agendamentos em JSON (fora do Git)
docs/               anotações de desenvolvimento
```

## Rodando localmente

Requer Node.js 20 ou superior.

```bash
npm install
cp .env.example .env     # preencha pelo menos ADMIN_TOKEN
npm run dev              # http://localhost:8080
```

Para testar as respostas do bot sem WhatsApp: `npm run bot:cli`.

## Rotas

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/leads` | Salva contato do popup (`contact`: e-mail ou WhatsApp) |
| POST | `/api/agendamentos` | Salva pedido de agendamento |
| GET | `/api/admin/leads` | Lista tudo — exige cabeçalho `x-admin-token` |
| GET/POST | `/webhook` | Verificação e mensagens do WhatsApp Cloud API |
| GET | `/health` | Health check (`{ ok: true }`) |

As rotas POST têm limite de 10 envios a cada 10 minutos por IP (anti-spam).

## Deploy na Railway

1. **New Project → Deploy from GitHub repo** e escolha este repositório. A Railway detecta o Node pelo `package.json` e roda `npm start`.
2. Em **Variables**, cadastre pelo menos `ADMIN_TOKEN` (e as do WhatsApp, se for usar o bot — veja `.env.example`).
3. Em **Settings → Networking**, clique em **Generate Domain** para ter a URL pública.
4. **Crie um Volume** (botão direito no canvas → Volume) e conecte ao serviço com mount path `/data`.
   Sem isso, **os leads são apagados a cada novo deploy**. O servidor lê a variável `RAILWAY_VOLUME_MOUNT_PATH` (que a Railway preenche sozinha), então não precisa configurar mais nada.
   Se aparecer erro de permissão ao salvar, adicione a variável `RAILWAY_RUN_UID=0`.
5. (Opcional) Em **Settings → Deploy**, configure o Healthcheck Path como `/health`.

Para ver os contatos: acesse `https://SEU-DOMINIO/admin-leads.html` e digite o valor de `ADMIN_TOKEN`.

## WhatsApp (Cloud API)

No painel do app na Meta (WhatsApp → Configuration):

- **Callback URL:** `https://SEU-DOMINIO/webhook`
- **Verify token:** o mesmo valor da variável `VERIFY_TOKEN`
- Assine o campo **messages**.

O menu do bot fica em `bot/respostas.js`.

## Próximos passos sugeridos

Arquivos JSON servem para começar. Com mais volume de contatos, o ideal é migrar para um banco (o próprio Postgres da Railway, por exemplo) ou enviar para uma planilha/CRM.
