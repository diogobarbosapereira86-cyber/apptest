# Conteúdo para o seu Instagram

Ferramenta simples para donos de pequenos negócios (restaurantes, bares, lanchonetes, lojas de bairro) que não têm familiaridade com tecnologia. O dono preenche uma vez os dados do negócio e recebe:

- **Calendário do mês:** um post para cada dia escolhido, com horário, formato (Reels, Carrossel, Foto ou Story), ideia, passo a passo para gravar com o celular, legenda pronta e hashtags. Dá para copiar a legenda com um toque e marcar "Já postei".
- **Novas ideias:** 5 ideias de post sempre que precisar, sem repetir as que já estão no calendário.
- **Dicas para crescer:** ações práticas para mais gente conhecer o negócio, adaptadas ao tipo de negócio e à cidade.

O conteúdo é gerado pela API do Claude. Não tem login nem banco de dados: os dados do negócio, o calendário e as ideias ficam salvos no navegador de quem usa.

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
   - `CODIGO_DE_ACESSO` com um código à sua escolha (recomendado, veja abaixo).
5. Clique em **Create Web Service**. Em alguns minutos o Render mostra o endereço do site.

No plano grátis, o Render desliga o site quando ninguém usa por um tempo. A primeira visita depois disso pode demorar perto de um minuto para abrir.

## Proteção de uso

Como não há login, quem tiver o link pode gerar conteúdo, e o custo vai para a sua conta da API. Há duas proteções:

- **`CODIGO_DE_ACESSO`:** se preenchido, o site pede esse código antes de gerar qualquer coisa. Combine o código com os donos de negócio que estão testando.
- **`MAX_GERACOES_POR_DIA`:** limite de gerações por visitante por dia (padrão: 30).

Também vale definir um limite de gastos mensal em **Limits**, no painel da API.

## Quanto custa usar

O site usa o modelo `claude-opus-5-5` (US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída). São estimativas, que variam com o tamanho do cardápio e a quantidade de posts:

- Um calendário do mês com 3 posts por semana: perto de US$ 0,20 a US$ 0,30.
- Um pedido de novas ideias ou de dicas: perto de US$ 0,05 a US$ 0,10.

Para gastar menos, defina `CLAUDE_MODEL=claude-sonnet-5-5`, que custa cerca de metade. Vale comparar a qualidade das legendas antes de trocar.

## Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sim | Chave da API do Claude |
| `CODIGO_DE_ACESSO` | Não | Código pedido antes de gerar conteúdo |
| `MAX_GERACOES_POR_DIA` | Não | Gerações por visitante por dia (padrão 30) |
| `CLAUDE_MODEL` | Não | Modelo usado (padrão `claude-opus-5-5`) |
| `PORT` | Não | Porta do servidor (padrão 3000; o Render define sozinho) |

## Como o código está organizado

- `server.js`: servidor Express. Entrega o site e as rotas `/api/calendario`, `/api/ideias` e `/api/dicas`.
- `lib/conteudo.js`: as instruções para a IA e o formato de cada resposta.
- `lib/datas.js`: escolhe as datas dos posts do mês, para dia e dia da semana estarem sempre certos.
- `public/`: a página (HTML, CSS e JavaScript, sem framework).
- `test/`: testes (`npm test`).

## Limites desta primeira versão

- Não publica no Instagram sozinha: o dono copia a legenda e posta pelo app.
- Não gera imagens nem vídeos: a ferramenta diz o que gravar ou fotografar com o celular.
- Os dados ficam só no navegador. Se o dono trocar de celular ou limpar o navegador, perde o calendário.
