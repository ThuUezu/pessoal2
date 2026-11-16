# Cuidar da Analy — API (Render)

> **Este repositório é só o backend** (Node + Fastify + Prisma + PostgreSQL), publicado no Render. O frontend (PWA) fica em outro repositório e roda no Netlify, que repassa `/api/*` para cá.

App pessoal e privado (PWA) para lembrar de reparar no que a Analy gosta e demonstrar cuidado de forma constante. Usado por uma pessoa só. Interface toda em português do Brasil.

**Estado: Fase 1 de 4.** Login com Google, lista de "Coisas que ela gosta" com foto, marcar como comprado e a captura rápida "Ela pegou e devolveu".

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 | Login Google, coisas com foto, marcar comprado, captura rápida | **entregue** |
| 2 | Lembretes e push, Configurações, PIN de bloqueio, inventário "acabando", exportar `.ics` | próxima |
| 3 | Postagens, cartas e desenhos, datas importantes, jantares e passeios, perfil da Analy | |
| 4 | Diário de 30 segundos, revisão semanal, orçamento, backup JSON | |

## Como este repositório é organizado

```
src/           Fastify: rotas, sessão, validação e Cloudinary
prisma/        Esquema do banco e migrations
test/          Testes (Vitest)
render.yaml    Blueprint do Render
```

## Rodando no seu computador

Pré-requisitos: Node 20 (ou 22), npm e um PostgreSQL (local ou uma conta gratuita no Neon).

```bash
npm ci
cp .env.example .env        # preencha os valores (veja os comentários no arquivo)
npm run migrate:deploy      # cria as tabelas
npm run dev                 # http://localhost:3000
```

O frontend (outro repositório) abre em `http://localhost:5173` e repassa `/api/*` para cá. Use `WEB_ORIGIN=http://localhost:5173` no `.env`.

## Publicando (a ordem importa)

> Esta seção é igual nos dois repositórios, porque Google, Render e Netlify precisam saber o endereço uns dos outros. **Os passos 1, 4 e 5 são do repositório da API; os passos 2, 6 e 7 são do frontend;** o 3 é no Google Cloud.

Há uma dependência circular: o Google, o Render e o Netlify precisam saber o endereço uns dos outros. Seguindo esta ordem você não precisa voltar atrás.

### 1. Banco de dados (Neon)

1. Crie um projeto em neon.tech (plano gratuito). Escolha a região `aws-us-east-1` (combina com a região do `render.yaml`).
2. Copie a **string de conexão direta**, a que **não** tem `-pooler` no endereço. As migrations usam travas que o pooler não suporta.
3. Guarde-a: é a `DATABASE_URL`.

> Não use o Postgres gratuito do Render: ele expira. Se preferir o Render pago, a `DATABASE_URL` funciona do mesmo jeito.

### 2. Site no Netlify (só para saber o endereço)

1. Suba este repositório para o GitHub (privado).
2. Netlify > Add new site > Import an existing project. Ele lê o `netlify.toml` sozinho (build `npm run build`, pasta `dist`).
3. O primeiro deploy deve funcionar, mas o app ainda não terá login nem acesso ao backend. Isso só fica pronto nos passos 6 e 7.
4. Em Site configuration, troque o nome do site (ex.: `cuidar-da-analy`). O endereço será `https://cuidar-da-analy.netlify.app`. **Anote-o.**

### 3. Login com Google

1. Google Cloud Console: crie um projeto. Em APIs e serviços > Tela de permissão OAuth (hoje também chamada de Google Auth Platform), configure o app como **Externo** com nome "Cuidar da Analy".
   - Pode deixar em modo **Teste** e adicionar o seu e-mail como usuário de teste, ou publicar o app: ele só pede e-mail e perfil, que não exigem revisão do Google.
2. Credenciais > Criar credenciais > ID do cliente OAuth > **Aplicativo da Web**.
   - **Origens JavaScript autorizadas:** `https://cuidar-da-analy.netlify.app` e `http://localhost:5173`
   - **URIs de redirecionamento autorizados:** `https://cuidar-da-analy.netlify.app/api/auth/google/callback` e `http://localhost:5173/api/auth/google/callback`
3. Copie o **Client ID**: é a `GOOGLE_CLIENT_ID` (backend) e a `VITE_GOOGLE_CLIENT_ID` (frontend). Não é um segredo.

Os nomes dos menus do Google mudam de vez em quando; o que importa são os dois campos acima.

### 4. Fotos (Cloudinary)

1. Conta gratuita em cloudinary.com.
2. No painel, copie `Cloud name`, `API Key` e `API Secret`.
3. Não precisa criar "upload preset": o app usa upload **assinado** (o backend assina cada envio; o `API Secret` nunca vai para o navegador).

### 5. Backend (Render)

1. Render > New > **Blueprint** e aponte para o repositório. Ele lê o `render.yaml`.
2. Preencha as variáveis que ele pedir:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string direta do Neon (passo 1) |
| `GOOGLE_CLIENT_ID` | Client ID (passo 3) |
| `ALLOWED_EMAIL` | o e-mail Google que vai usar o app |
| `WEB_ORIGIN` | `https://cuidar-da-analy.netlify.app` (passo 2), sem barra no fim |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | passo 4 |

`SESSION_SECRET` o Render gera sozinho (trocar esse valor desloga todo mundo).

3. Aguarde o deploy. Abra `https://SEU-SERVICO.onrender.com/api/health`: deve responder `{"status":"ok"}`. **Anote o endereço do serviço.**

Na inicialização o backend aplica as migrations do banco (`prisma migrate deploy`) antes de subir.

### 6. Ligar o Netlify ao Render

Edite `public/_redirects` e troque `SEU-SERVICO.onrender.com` pelo endereço do passo 5:

```
/api/*  https://SEU-SERVICO.onrender.com/api/:splat  200
/*      /index.html                                  200
```

Isso faz o navegador falar só com o domínio do Netlify. Por isso o cookie de sessão é "do mesmo site" e o Safari do iPhone não o bloqueia. Faça commit e push.

### 7. Variável do frontend e deploy final

No Netlify > Environment variables: `VITE_GOOGLE_CLIENT_ID` = Client ID. Depois Deploys > Trigger deploy. Abra o site: deve aparecer o botão "Fazer login com o Google".

### Plano gratuito do Render dorme

Depois de ~15 minutos sem uso o serviço dorme e a primeira chamada leva 30 a 60 segundos para acordar. O proxy do Netlify desiste em 26 segundos, então a primeira tentativa pode dar erro. O app já trata isso (tenta de novo sozinho e mostra "O servidor está acordando"), mas para não depender disso:

- crie um monitor gratuito no cron-job.org chamando `https://SEU-SERVICO.onrender.com/api/health` a cada **10 minutos** (15 é o limite exato do sono, 10 dá folga), ou
- use o plano `starter` do Render (`plan: starter` no `render.yaml`).

Na Fase 2 o agendador de lembretes (a cada 15 min) cumpre esse papel.

## Rotas da API

Tudo sob `/api`. JSON em português nas mensagens; `code` é estável para o frontend. Erros sempre têm este formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Alguns campos estão inválidos.", "details": { "name": ["Dê um nome para a coisa"] } } }
```

| Método e caminho | Login | O que faz |
|---|---|---|
| `GET /health` | não | Verificação de saúde (Render) |
| `POST /auth/google/callback` | não | Recebe o login do Google (formulário), cria a sessão e redireciona para `/` (ou `/?erro=...`) |
| `POST /auth/logout` | não | Apaga o cookie de sessão (204) |
| `GET /me` | sim | `{ email, name }` da sessão |
| `GET /items?status=PENDENTE\|COMPRADO&page=1&pageSize=50` | sim | Lista paginada: `{ data, pagination }`. Pendentes: prioridade alta primeiro, depois mais novos. Comprados: compra mais recente primeiro |
| `POST /items` | sim | Cria (só `name` é obrigatório). 201 |
| `GET /items/:id` | sim | Um item |
| `PATCH /items/:id` | sim | Edição parcial. `status: "COMPRADO"` grava a data da compra no servidor (repetir não muda a data); `"PENDENTE"` limpa. `photo: null` remove a foto, `photo: {url, publicId}` troca, ausente mantém |
| `DELETE /items/:id` | sim | Apaga (204, também se já não existir) e remove a foto da Cloudinary |
| `POST /uploads/signatures` | sim | Assinatura para o navegador enviar a foto direto à Cloudinary |

Valores: `category` MAQUIAGEM, COMIDA, ROUPA, OUTRO. `priority` BAIXA, MEDIA, ALTA. `origin` ELA_PEDIU, PEGOU_E_DEVOLVEU, ESTAVA_ACABANDO. `paidWith` MEU_DINHEIRO, CAIXINHA. Campos desconhecidos (como `id` ou `purchasedAt`) são recusados com 422.

## Segurança: o que está no lugar

- Login só com Google; o backend valida o ID token (assinatura, validade, emissor e audiência) e só aceita `ALLOWED_EMAIL` com e-mail verificado.
- Sessão em cookie `httpOnly`, `Secure`, `SameSite=Lax`, assinado por HMAC, validade de 30 dias. Em produção usa o prefixo `__Host-` (o navegador recusa o cookie se ele não for Secure e sem `Domain`).
- Defesas contra CSRF: `SameSite=Lax`, conferência do cabeçalho `Origin` em pedidos que alteram dados, token CSRF do próprio Google no login e só JSON como corpo de pedido.
- Validação de toda entrada com zod (campos extras são recusados). Rate limit global (300/min) e mais apertado no login (10 por 15 min). `helmet` e CORS restrito ao `WEB_ORIGIN`.
- Fotos: upload assinado pelo backend (pasta fixa), e o backend só aceita URLs da sua conta Cloudinary, dentro dessa pasta.
- No Netlify: CSP restrita (só o site, o login do Google e a Cloudinary), HSTS, `frame-ancestors 'none'` e `nosniff`.
- Nenhum segredo no repositório: tudo por variáveis de ambiente (`api/.env.example`).

## Testes

```bash
npm test
```

A API tem testes de integração que usam um Postgres de verdade. Eles só rodam se você definir `TEST_DATABASE_URL`, e **apagam a tabela `Item` desse banco**, então use um banco separado:

```bash
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/cuidar_teste npm test
```

Sem essa variável, os testes de banco são pulados e o resto roda (sessão, login, upload, validação, configuração).

## Decisões tomadas (e por quê)

Você pediu para eu escolher o mais simples e anotar aqui.

- **Node 20 mantido, mas já saiu de suporte.** O Node 20 chegou ao fim da vida em abril de 2026. Mantive porque você pediu e porque o código e os testes passam em 20.20 e 22. Para trocar, mude `NODE_VERSION` de `"20"` para `"22"` no `render.yaml`. Recomendo fazer isso antes de usar de verdade.
- **Dependências escolhidas para rodar em Node 20:** `google-auth-library` 10 e `vitest` 3 (as versões 11 e 5 exigem Node 22).
- **Prisma 6 com o modo `engineType = "client"`.** Usa o driver `pg` direto, sem o motor binário em Rust. Menos coisa para quebrar no Render e igual no Neon. As migrations ficam em `api/prisma/migrations`.
- **Login em modo "redirect".** O Google devolve o login por POST para `/api/auth/google/callback`, em vez de abrir uma janela pop-up, porque pop-ups são pouco confiáveis em apps instalados na tela de início do iPhone.
- **Sessão sem estado** (cookie assinado), sem tabela de sessões nem JWT: uma pessoa só, menos peças.
- **Sem tabela de usuários:** o app é de uma pessoa só; quem manda é `ALLOWED_EMAIL`.
- **Fotos órfãs:** se você enviar uma foto e cancelar antes de salvar, ela não é enviada (o envio só acontece ao salvar). Se a Cloudinary falhar ao apagar uma foto antiga, o item é salvo mesmo assim e sobra um arquivo solto lá (sem custo relevante).

## O que não consegui testar daqui

Rodei e conferi: 71 testes da API (também sob Node 20 real), 14 do frontend, um teste de mutação em 8 pontos críticos da API, e 34 verificações no navegador (Chromium em tela de iPhone) contra a API e um Postgres reais, incluindo a CSP do `netlify.toml` aplicada. O que **não** foi possível:

- **iPhone e Safari reais.** Usei Chromium. A câmera (`capture`), o `HEIC`, o teclado, as áreas seguras e o modo instalado só você consegue confirmar: use a lista de validação acima.
- **Login do Google de verdade.** O script do Google foi simulado no navegador; o backend foi testado com o verificador substituído. O fluxo "redirect" e os URIs autorizados dependem da sua configuração (passo 3).
- **Cloudinary de verdade.** O algoritmo de assinatura bate com o exemplo oficial da documentação, mas o envio real não foi feito.
- **Neon (SSL) e Render.** Testei contra um Postgres local. As migrations foram escritas à mão (o `prisma migrate` não roda no meu ambiente) e validadas aplicando o SQL e rodando todos os testes de banco. Para conferir que não há divergência, localmente, depois de configurar o `.env`: `npx prisma migrate dev` deve dizer que tudo está em sincronia.
- **Proxy do Netlify repassando o `Set-Cookie`.** É o comportamento documentado e o desenho que você pediu, mas só se confirma no ar (passo 1 da validação).

## Problemas comuns

- **Voltei para a tela de login sem erro:** o cookie não foi aceito. Confira se o `_redirects` aponta para o Render certo e se `WEB_ORIGIN` é exatamente o endereço do site.
- **"Esse e-mail não tem acesso":** `ALLOWED_EMAIL` diferente da conta usada no Google.
- **Erro 403 `BAD_ORIGIN`:** `WEB_ORIGIN` não bate com o endereço aberto no navegador. Se usar domínio próprio, coloque os dois separados por vírgula.
- **Primeira abertura demora ou dá erro 504:** o Render estava dormindo (veja "Plano gratuito do Render dorme").
- **Foto não sobe:** confira `CLOUDINARY_*` no Render. Uma chave errada gera "A foto não foi aceita pelo serviço de imagens".
