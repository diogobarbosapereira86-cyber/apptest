# Conteúdo para o seu Instagram

Ferramenta simples para donos de pequenos negócios (restaurantes, bares, lanchonetes, lojas de bairro) que não têm familiaridade com tecnologia.

- **Cadastro com análise:** o dono informa o Instagram e o site, manda a foto ou o PDF do cardápio e fotos do negócio. A ferramenta lê tudo, preenche o cadastro (produtos, preços, público, tom de voz) e mostra pontos fortes e o que melhorar. Antes, o dono autoriza o uso dos dados e das fotos.
- **Calendário da semana:** um story por dia (de 2 a 4 telas, com figurinhas de enquete e perguntas) e os posts do feed (Reels, Carrossel e Foto), com horário, como gravar, texto de cada slide, legenda pronta e hashtags.
- **Nova ideia:** em cada story ou post, um botão troca a sugestão por outra diferente.
- **Criar com IA:** monta a arte pronta para postar (1080×1350 no feed, 1080×1920 no story) com a foto do próprio negócio, o texto e as cores da marca, e baixa a imagem. Opcionalmente, gera um fundo com IA pela Pollinations.
- **Novas ideias e dicas para crescer**, como na primeira versão.

O conteúdo é gerado pela API do Claude. Não tem login nem banco de dados: os dados, a autorização, o calendário e as fotos ficam salvos no navegador de quem usa.

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

- Análise do negócio com cardápio e até 8 fotos: perto de US$ 0,10 a US$ 0,25.
- Um calendário da semana (7 stories e 3 posts): perto de US$ 0,15 a US$ 0,25.
- Uma troca de ideia, um pedido de novas ideias ou de dicas: perto de US$ 0,03 a US$ 0,10.

Para gastar menos, defina `CLAUDE_MODEL=claude-sonnet-5-5`, que custa cerca de metade. Vale comparar a qualidade das legendas antes de trocar.

## Imagens: o que é grátis e o que não é

- **Arte com a foto do cliente ou com as cores da marca:** é montada no próprio navegador, sem custo e sem limite. É o caminho recomendado: foto real do produto passa mais confiança, e o iFood, por exemplo, só aceita imagem de IA que represente fielmente o prato.
- **Imagem gerada pela IA:** usa a Pollinations. Desde 2026 ela exige uma chave, e a conta grátis vem com um saldo pequeno ("Pollen") que acaba com o uso. Crie a conta em https://pollinations.ai, gere a chave e coloque em `POLLINATIONS_API_KEY`. Sem a chave, o botão não aparece. Não testei com a chave real; se a Pollinations mudar o endereço, ajuste em `POLLINATIONS_URL`.

## Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sim | Chave da API do Claude |
| `CODIGO_DE_ACESSO` | Não | Código pedido antes de gerar conteúdo |
| `MAX_GERACOES_POR_DIA` | Não | Gerações por visitante por dia (padrão 30) |
| `CLAUDE_MODEL` | Não | Modelo usado (padrão `claude-opus-5-5`) |
| `POLLINATIONS_API_KEY` | Não | Liga o botão "Imagem gerada pela IA" |
| `POLLINATIONS_URL` | Não | Endereço da Pollinations (padrão `https://gen.pollinations.ai`) |
| `PORT` | Não | Porta do servidor (padrão 3000; o Render define sozinho) |

## Como o código está organizado

- `server.js`: servidor Express. Entrega o site e as rotas `/api/analisar`, `/api/fotos`, `/api/semana`, `/api/trocar`, `/api/ideias`, `/api/dicas` e `/api/imagem`.
- `lib/conteudo.js`: as instruções para a IA e o formato de cada resposta.
- `lib/datas.js`: monta os dias da semana e escolhe os dias de post no feed.
- `lib/pagina.js`: lê o site e o Instagram informados, só em endereços públicos.
- `public/`: a página (HTML, CSS e JavaScript, sem framework).
- `test/`: testes (`npm test`).

## Limites desta primeira versão

- Não publica no Instagram sozinha: o dono baixa a arte, copia a legenda e posta pelo app.
- Não edita vídeo: para Reels e stories em vídeo, a ferramenta diz o que gravar.
- O Instagram mostra pouca coisa para quem não está logado, então a análise do perfil costuma pegar só nome, bio e números.
- Os dados e as fotos ficam só no navegador. Se o dono trocar de celular ou limpar o navegador, perde tudo, inclusive o registro da autorização.
