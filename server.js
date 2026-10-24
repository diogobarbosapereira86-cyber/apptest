import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import {
  ErroDeGeracao,
  analisarNegocio,
  descreverFotos,
  gerarDicas,
  gerarIdeias,
  gerarSemana,
  trocarItem,
} from "./lib/conteudo.js";
import { segundaValida } from "./lib/datas.js";
import { lerInstagram, lerSite } from "./lib/pagina.js";
import { abrirBanco } from "./lib/banco.js";
import { criarLogin } from "./lib/login.js";

const PORTA = Number(process.env.PORT) || 3000;
// Código de convite pedido para criar uma conta nova. Vazio: qualquer um pode criar conta.
const CODIGO_DE_ACESSO = (process.env.CODIGO_DE_ACESSO || "").trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const MAX_POR_DIA = Number(process.env.MAX_GERACOES_POR_DIA) || 30;
const CHAVE_IMAGENS = (process.env.GEMINI_API_KEY || "").trim();
const MODELO_IMAGENS = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";
const URL_IMAGENS = process.env.GEMINI_URL || "https://generativelanguage.googleapis.com";

const MAX_FOTOS_POR_ENVIO = 8;
const TIPOS_DE_CARDAPIO = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
// Tamanho em base64 (cerca de 4/3 do arquivo).
const MAX_CARDAPIO_BASE64 = 11_000_000;
const MAX_FOTO_BASE64 = 3_000_000;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "40mb" }));
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

const banco = await abrirBanco();
await banco.apagarSessoesVencidas();
const { rotas: rotasDeLogin, exigirLogin } = criarLogin({
  banco,
  convite: CODIGO_DE_ACESSO,
  googleClientId: GOOGLE_CLIENT_ID,
});
app.use(rotasDeLogin);

app.get("/api/config", (req, res) => {
  res.json({
    pedeConvite: Boolean(CODIGO_DE_ACESSO),
    googleClientId: GOOGLE_CLIENT_ID,
    chaveConfigurada: Boolean(process.env.ANTHROPIC_API_KEY),
    geraImagem: Boolean(CHAVE_IMAGENS),
  });
});

// Limite simples de gerações por conta, guardado em memória.
// Zera quando o dia muda ou quando o servidor reinicia.
const usoPorConta = new Map();
function dentroDoLimite(chave) {
  const hoje = new Date().toISOString().slice(0, 10);
  const uso = usoPorConta.get(chave);
  if (!uso || uso.dia !== hoje) {
    usoPorConta.set(chave, { dia: hoje, total: 1 });
    return true;
  }
  if (uso.total >= MAX_POR_DIA) return false;
  uso.total++;
  return true;
}

function limiteDoDia(req, res, next) {
  if (!dentroDoLimite(req.usuario.id)) {
    return res.status(429).json({ erro: `Você já fez ${MAX_POR_DIA} gerações hoje. Volte amanhã para gerar mais.` });
  }
  next();
}

const acessoLiberado = [exigirLogin, limiteDoDia];

function temChaveClaude(req, res, next) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      erro: "O site ainda não tem a chave da API do Claude. Veja no README como configurar a ANTHROPIC_API_KEY.",
    });
  }
  next();
}

function perfilCompleto(req, res, next) {
  const perfil = req.body?.perfil;
  if (!perfil || typeof perfil !== "object" || !perfil.nome || !perfil.tipo || !perfil.produtos) {
    return res.status(400).json({ erro: "Preencha os dados do seu negócio antes de gerar conteúdo." });
  }
  next();
}

function temAutorizacao(req, res, next) {
  if (req.body?.autorizado !== true) {
    return res.status(400).json({ erro: "Para analisar seus arquivos, marque a autorização de uso dos dados e fotos." });
  }
  next();
}

const gerar = [exigirLogin, temChaveClaude, perfilCompleto, limiteDoDia];

function fotosValidas(fotos) {
  if (fotos === undefined) return [];
  if (!Array.isArray(fotos) || fotos.length > MAX_FOTOS_POR_ENVIO) return null;
  const validas = fotos.every(
    (f) =>
      f &&
      typeof f.id === "string" &&
      /^[A-Za-z0-9-]{1,40}$/.test(f.id) &&
      typeof f.dados === "string" &&
      f.dados.length <= MAX_FOTO_BASE64,
  );
  return validas ? fotos : null;
}

function cardapioValido(cardapio) {
  if (!cardapio) return undefined;
  const valido =
    TIPOS_DE_CARDAPIO.includes(cardapio.tipo) &&
    typeof cardapio.dados === "string" &&
    cardapio.dados.length <= MAX_CARDAPIO_BASE64;
  return valido ? cardapio : null;
}

function responderErro(res, erro) {
  if (erro instanceof ErroDeGeracao) {
    return res.status(502).json({ erro: erro.message });
  }
  if (erro instanceof Anthropic.AuthenticationError) {
    console.error("Chave da API recusada:", erro.message);
    return res.status(500).json({ erro: "A chave da API do Claude está errada ou foi desativada. Confira a ANTHROPIC_API_KEY." });
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ erro: "Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo." });
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    console.error("Sem conexão com a API:", erro.message);
    return res.status(502).json({ erro: "Não consegui falar com a IA agora. Verifique a internet do servidor e tente de novo." });
  }
  if (erro instanceof Anthropic.BadRequestError) {
    console.error("Pedido recusado pela API:", erro.message);
    return res.status(400).json({ erro: "A IA não conseguiu ler algum arquivo. Tente com uma foto mais nítida ou um PDF menor." });
  }
  if (erro instanceof Anthropic.APIError) {
    console.error("Erro da API do Claude:", erro.status, erro.message);
    return res.status(502).json({ erro: "A IA está com problema no momento. Tente de novo em alguns minutos." });
  }
  console.error(erro);
  return res.status(500).json({ erro: "Algo deu errado. Tente de novo." });
}

app.post("/api/analisar", exigirLogin, temChaveClaude, temAutorizacao, limiteDoDia, async (req, res) => {
  const { perfil } = req.body;
  if (!perfil?.nome || !perfil?.tipo) {
    return res.status(400).json({ erro: "Preencha pelo menos o nome e o tipo do negócio." });
  }
  const cardapio = cardapioValido(req.body.cardapio);
  const fotos = fotosValidas(req.body.fotos);
  if (cardapio === null) return res.status(400).json({ erro: "O cardápio precisa ser uma foto ou um PDF de até 8 MB." });
  if (fotos === null) return res.status(400).json({ erro: `Envie até ${MAX_FOTOS_POR_ENVIO} fotos de cada vez.` });
  try {
    const [site, instagram] = await Promise.all([lerSite(perfil.site), lerInstagram(perfil.instagram)]);
    const analise = await analisarNegocio({ perfil, cardapio, fotos, site, instagram });
    res.json({ ...analise, leituras: { site: site.lido, instagram: instagram.lido } });
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/fotos", exigirLogin, temChaveClaude, temAutorizacao, limiteDoDia, async (req, res) => {
  const fotos = fotosValidas(req.body.fotos);
  if (!fotos?.length) return res.status(400).json({ erro: `Envie de 1 a ${MAX_FOTOS_POR_ENVIO} fotos de cada vez.` });
  try {
    res.json(await descreverFotos(fotos));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/semana", gerar, async (req, res) => {
  const { perfil, segunda } = req.body;
  if (!segundaValida(segunda)) return res.status(400).json({ erro: "Escolha uma semana válida." });
  try {
    res.json(await gerarSemana(perfil, segunda));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/trocar", gerar, async (req, res) => {
  const { perfil, tipo, item } = req.body;
  if (!["story", "feed"].includes(tipo) || !item || typeof item.data !== "string") {
    return res.status(400).json({ erro: "Não encontrei a sugestão para trocar. Recarregue a página e tente de novo." });
  }
  const outros = Array.isArray(req.body.outrosTitulos) ? req.body.outrosTitulos : [];
  try {
    res.json(await trocarItem(perfil, tipo, item, outros));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/ideias", gerar, async (req, res) => {
  const titulos = Array.isArray(req.body.titulosExistentes) ? req.body.titulosExistentes : [];
  try {
    res.json(await gerarIdeias(req.body.perfil, titulos));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/dicas", gerar, async (req, res) => {
  try {
    res.json(await gerarDicas(req.body.perfil));
  } catch (erro) {
    responderErro(res, erro);
  }
});

// Gera o fundo da arte pela API do Gemini (Interactions API), cobrada por imagem.
// A chave fica só no servidor; sem ela, o botão de imagem gerada nem aparece.
app.post("/api/imagem", acessoLiberado, async (req, res) => {
  if (!CHAVE_IMAGENS) return res.status(503).json({ erro: "A geração de imagens não está ligada neste site." });
  const prompt = String(req.body?.prompt ?? "").slice(0, 600).trim();
  if (!prompt) return res.status(400).json({ erro: "Falta a descrição da imagem." });
  const vertical = req.body?.formato === "story";
  const falhou = "Não consegui gerar a imagem agora. Tente de novo ou use uma foto sua.";
  try {
    const resposta = await fetch(`${URL_IMAGENS}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": CHAVE_IMAGENS, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO_IMAGENS,
        // O texto da arte é escrito por cima no navegador, então a imagem vem sem letras.
        input: `${prompt}. Photorealistic, appetizing, natural light. No text, letters, logos or watermarks.`,
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: vertical ? "9:16" : "4:5", image_size: "1K" },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const dados = await resposta.json().catch(() => null);
    const imagem = dados?.steps
      ?.flatMap((passo) => (passo.type === "model_output" ? passo.content ?? [] : []))
      .findLast((bloco) => bloco.type === "image" && bloco.data);
    if (!resposta.ok || !imagem) {
      console.error("Gemini respondeu", resposta.status, JSON.stringify(dados?.error ?? dados?.errors ?? dados?.status ?? "").slice(0, 300));
      let erro = falhou;
      if (resposta.status === 429) erro = "O limite de imagens do Gemini acabou por agora. Use uma foto sua ou o fundo com as cores.";
      else if (resposta.status === 400 && /billing|FAILED_PRECONDITION/i.test(JSON.stringify(dados))) {
        erro = "A chave do Gemini precisa de faturamento ativo no Google AI Studio para gerar imagens.";
      } else if (resposta.status === 401 || resposta.status === 403) erro = "A chave do Gemini foi recusada. Confira a GEMINI_API_KEY.";
      else if (resposta.ok) erro = "O Gemini não devolveu imagem para essa descrição. Tente outra imagem ou use uma foto sua.";
      return res.status(502).json({ erro });
    }
    res.set("content-type", imagem.mime_type || "image/jpeg");
    res.send(Buffer.from(imagem.data, "base64"));
  } catch (erro) {
    console.error("Erro ao gerar imagem:", erro.message);
    res.status(502).json({ erro: falhou });
  }
});

app.listen(PORTA, () => {
  console.log(`Site rodando em http://localhost:${PORTA}`);
  if (process.env.RENDER && banco.tipo !== "postgres") {
    console.warn("Atenção: sem DATABASE_URL, as contas somem quando o Render reinicia o site. Veja o README.");
  }
  console.log(banco.tipo === "postgres" ? "Contas salvas no Postgres (DATABASE_URL)." : `Contas salvas no arquivo ${process.env.ARQUIVO_BANCO || "dados/app.db"}.`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Atenção: ANTHROPIC_API_KEY não configurada. Veja o README.");
  }
});
