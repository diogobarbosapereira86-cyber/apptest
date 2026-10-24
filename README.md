# Conteúdo para o seu Instagram

Ferramenta simples para donos de pequenos negócios (restaurantes, bares, lanchonetes, lojas de bairro) que não têm familiaridade com tecnologia.

- **Cadastro com análise:** o dono informa o Instagram e o site, manda a foto ou o PDF do cardápio e fotos do negócio. A ferramenta lê tudo, preenche o cadastro (produtos, preços, público, tom de voz) e mostra pontos fortes e o que melhorar. Antes, o dono autoriza o uso dos dados e das fotos.
- **Calendário da semana:** um story por dia (de 2 a 4 telas, com figurinhas de enquete e perguntas) e os posts do feed (Reels, Carrossel e Foto), com horário, como gravar, texto de cada slide, legenda pronta e hashtags.
- **Nova ideia:** em cada story ou post, um botão troca a sugestão por outra diferente.
- **Criar arte, do jeito de cada formato:**
  - **Post de foto:** uma imagem de 1080×1350.
  - **Carrossel:** até 20 slides de 1080×1350, com texto em cada um, e "Baixar todos" num .zip.
  - **Reels:** vídeo vertical de 1080×1920 (até 90 s), com o texto por cima e a capa separada. Com uma foto, vira um vídeo de 7 segundos com movimento.
  - **Story:** de 2 a 10 telas de 1080×1920, com foto ou vídeo (até 60 s) em cada uma.

  Em todos, a mídia vem de três lugares: **Minhas fotos** (guardadas no cadastro), **Criar com IA** (Gemini) ou **Subir mídia** (um arquivo só para aquela arte, que não fica guardado). Dá para arrastar, aumentar e diminuir a imagem ou o vídeo, escolher onde fica o texto e ver as áreas que o Instagram cobre.
- **Login:** cada pessoa entra com e-mail e senha ou com a conta Google.
- **Novas ideias e dicas para crescer**, como na primeira versão.

O conteúdo é gerado pela API do Claude. O banco de dados guarda só as contas e os logins. Os dados do negócio, a autorização, o calendário e as fotos ficam salvos no navegador de quem usa, separados por conta.

## Como rodar no seu computador

Você precisa do [Node.js](https://nodejs.org) versão 22 ou mais nova.

1. Baixe o projeto e instale as dependências:
   ```bash
   git clone https://github.com/diogobarbosapereira86-cyber/apptest.git
   cd apptest
   npm install
   ```
2. Coloque a chave da API (veja a seção abaixo):
   ```bash
   cp .env.example .env
   ```
   Abra o arquivo `.env` e troque `coloque-sua-chave-aqui` pela sua chave.
3. Ligue o site:
   ```bash
   npm start
   ```
4. Abra http://localhost:3000 no navegador.

## Como pegar e colocar a chave da API do Claude

1. Entre em https://platform.claude.com e crie uma conta (ou faça login).
2. Em **Billing**, adicione um cartão e um pouco de crédito. A API é cobrada por uso, separada da assinatura do Claude.ai.
3. Em **API Keys**, clique em **Create Key**, dê um nome (por exemplo, "site instagram") e copie a chave. Ela começa com `sk-ant-` e só aparece uma vez.
4. Cole a chave:
   - **No seu computador:** no arquivo `.env`, na linha `ANTHROPIC_API_KEY=`.
   - **Na hospedagem:** como variável de ambiente `ANTHROPIC_API_KEY` (passo a passo abaixo).

A chave fica só no servidor e nunca é enviada para o navegador. Não coloque a chave no código nem faça commit do arquivo `.env`: ele já está no `.gitignore`.

Se a chave vazar, apague-a em **API Keys** e crie outra.

## Como publicar na internet (Render)

O jeito mais simples é o [Render](https://render.com), que publica direto do GitHub.

1. Crie uma conta no Render entrando com o GitHub.
2. Clique em **New** e depois em **Web Service**, e escolha o repositório `apptest`.
3. Preencha:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Em **Environment Variables**, adicione:
   - `ANTHROPIC_API_KEY` com a sua chave.
   - `DATABASE_URL` com o endereço do banco (obrigatório no Render, veja "Banco de dados" abaixo).
   - `CODIGO_DE_ACESSO` com um código de convite à sua escolha (recomendado, veja abaixo).
   - `GEMINI_API_KEY` e `GOOGLE_CLIENT_ID`, se for usar.
5. Clique em **Create Web Service**. Em alguns minutos o Render mostra o endereço do site.

No plano grátis, o Render desliga o site quando ninguém usa por um tempo. A primeira visita depois disso pode demorar perto de um minuto para abrir.

## Banco de dados

O banco guarda as contas (nome, e-mail, senha protegida com scrypt e o vínculo com o Google) e as sessões de login.

- **No computador:** não precisa configurar nada. O site cria o arquivo `dados/app.db` (SQLite), que já está no `.gitignore`.
- **No Render:** o disco do plano grátis é apagado quando o site reinicia, então as contas sumiriam. Use um Postgres:
  1. Crie uma conta grátis em https://neon.tech e um projeto.
  2. Copie a "connection string" (começa com `postgresql://` e termina com `sslmode=require`).
  3. Coloque em `DATABASE_URL` no Render.

  As tabelas são criadas sozinhas na primeira vez.

## Entrar com o Google

O botão "Entrar com o Google" só aparece com `GOOGLE_CLIENT_ID`. Para criar:

1. Entre em https://console.cloud.google.com e crie um projeto.
2. Em **Google Auth Platform** (ou "APIs e serviços"), configure a tela de consentimento: nome do app, e-mail de suporte e público "Externo".
3. Em **Clientes** (ou "Credenciais"), crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, coloque `http://localhost:3000`, `http://localhost` e o endereço do Render (por exemplo, `https://seu-site.onrender.com`).
5. Copie o **ID do cliente** (termina com `.apps.googleusercontent.com`) para `GOOGLE_CLIENT_ID`. A chave secreta não é usada.

Enquanto o app estiver "Em teste" no Google, só os e-mails que você colocar em "Usuários de teste" conseguem entrar.

Se alguém já tem conta com senha e entra pelo Google com o mesmo e-mail, as duas viram uma conta só.

## Proteção de uso

Quem cria conta pode gerar conteúdo, e o custo vai para a sua conta da API. Há duas proteções:

- **`CODIGO_DE_ACESSO`:** se preenchido, vira um código de convite pedido para criar conta (com senha ou com o Google). Combine o código com os donos de negócio que estão testando.
- **`MAX_GERACOES_POR_DIA`:** limite de gerações por conta por dia (padrão: 30).

Também vale definir um limite de gastos mensal em **Limits**, no painel da API.

## Quanto custa usar

O site usa o modelo `claude-opus-5-5` (US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída). São estimativas, que variam com o tamanho do cardápio e a quantidade de posts:

- Análise do negócio com cardápio e até 8 fotos: perto de US$ 0,10 a US$ 0,25.
- Um calendário da semana (7 stories e 3 posts): perto de US$ 0,15 a US$ 0,25.
- Uma troca de ideia, um pedido de novas ideias ou de dicas: perto de US$ 0,03 a US$ 0,10.

Para gastar menos, defina `CLAUDE_MODEL=claude-sonnet-5-5`, que custa cerca de metade. Vale comparar a qualidade das legendas antes de trocar.

## Imagens: o que é grátis e o que não é

- **Minhas fotos e Subir mídia:** a arte é montada no próprio navegador, sem custo e sem limite. É o caminho recomendado: foto real do produto passa mais confiança, e o iFood, por exemplo, só aceita imagem de IA que represente fielmente o prato.
- **Google Flow:** o Google Flow não tem uma API oficial. Em "Criar com IA", o app copia a descrição da imagem e abre o Flow; você gera com a sua conta, baixa e traz pelo "Subir mídia".
- **Imagem gerada pelo Gemini:** usa a API do Gemini (modelo `gemini-3.1-flash-lite-image`, o "Nano Banana 2 Lite"). A assinatura do Google Flow ou do Gemini **não** cobre a API: ela é cobrada à parte, cerca de US$ 0,034 por imagem, e o nível grátis da API não gera imagens. Para ligar:
  1. Entre em https://aistudio.google.com com sua conta Google e clique em **Get API key** e depois em **Create API key**.
  2. Ative o faturamento do projeto (o AI Studio mostra o botão **Set up billing**).
  3. Coloque a chave em `GEMINI_API_KEY` no `.env` ou nas variáveis do Render.

  Sem a chave, o botão não aparece. Toda imagem gerada leva a marca d'água invisível SynthID do Google. Não testei com a chave real.

## Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sim | Chave da API do Claude |
| `DATABASE_URL` | No Render, sim | Postgres das contas. Vazio: arquivo `dados/app.db` |
| `CODIGO_DE_ACESSO` | Não | Código de convite para criar conta |
| `GOOGLE_CLIENT_ID` | Não | Liga o botão "Entrar com o Google" |
| `MAX_GERACOES_POR_DIA` | Não | Gerações por conta por dia (padrão 30) |
| `CLAUDE_MODEL` | Não | Modelo usado (padrão `claude-opus-5-5`) |
| `GEMINI_API_KEY` | Não | Liga o botão "Imagem gerada pelo Gemini" |
| `GEMINI_IMAGE_MODEL` | Não | Modelo de imagem (padrão `gemini-3.1-flash-lite-image`) |
| `PORT` | Não | Porta do servidor (padrão 3000; o Render define sozinho) |

## Como o código está organizado

- `server.js`: servidor Express. Entrega o site e as rotas `/api/analisar`, `/api/fotos`, `/api/semana`, `/api/trocar`, `/api/ideias`, `/api/dicas` e `/api/imagem`, todas só para quem entrou na conta.
- `lib/login.js` e `lib/banco.js`: contas, senhas, login com Google e sessões (Postgres ou SQLite).
- `lib/conteudo.js`: as instruções para a IA e o formato de cada resposta.
- `lib/datas.js`: monta os dias da semana e escolhe os dias de post no feed.
- `lib/pagina.js`: lê o site e o Instagram informados, só em endereços públicos.
- `public/`: a página (HTML, CSS e JavaScript, sem framework). O editor de arte fica em `public/editor.js`.
- `test/`: testes (`npm test`).

## Limites desta primeira versão

- Não publica no Instagram sozinha: o dono baixa a arte, copia a legenda e posta pelo app.
- O editor de vídeo é simples: enquadra, põe o texto e grava em MP4. Não corta trechos, não junta vídeos e não põe música. A gravação acontece em tempo real (um vídeo de 30 segundos leva 30 segundos), com a tela aberta.
- O vídeo sai em MP4 no Chrome, no Edge e no Safari atualizados. Em navegadores antigos ele sai em WebM, que o Instagram pode recusar.
- O Instagram mostra pouca coisa para quem não está logado, então a análise do perfil costuma pegar só nome, bio e números.
- O login protege o acesso, mas os dados do negócio e as fotos ainda ficam no navegador. Entrar com a mesma conta em outro celular não traz o cadastro; se o dono limpar o navegador, perde o cadastro e as fotos (a conta continua).
