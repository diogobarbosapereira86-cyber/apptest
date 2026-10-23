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

const PORTA = Number(process.env.PORT) || 3000;
const CODIGO_DE_ACESSO = (process.env.CODIGO_DE_ACESSO || "").trim();
const MAX_POR_DIA = Number(process.env.MAX_GERACOES_POR_DIA) || 30;
const CHAVE_IMAGENS = (process.env.POLLINATIONS_API_KEY || "").trim();
const URL_IMAGENS = process.env.POLLINATIONS_URL || "https://gen.pollinations.ai";

const MAX_FOTOS_POR_ENVIO = 8;
const TIPOS_DE_CARDAPIO = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
// Tamanho em base64 (cerca de 4/3 do arquivo).
const MAX_CARDAPIO_BASE64 = 11_000_000;
const MAX_FOTO_BASE64 = 3_000_000;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "40mb" }));
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

app.get("/api/config", (req, res) => {
  res.json({
    pedeCodigo: Boolean(CODIGO_DE_ACESSO),
    chaveConfigurada: Boolean(process.env.ANTHROPIC_API_KEY),
    geraImagem: Boolean(CHAVE_IMAGENS),
  });
});

// Limite simples de gerações por visitante (por IP), guardado em memória.
// Zera quando o dia muda ou quando o servidor reinicia.
const usoPorIp = new Map();
function dentroDoLimite(ip) {
  const hoje = new Date().toISOString().slice(0, 10);
  const uso = usoPorIp.get(ip);
  if (!uso || uso.dia !== hoje) {
    usoPorIp.set(ip, { dia: hoje, total: 1 });
    return true;
  }
  if (uso.total >= MAX_POR_DIA) return false;
  uso.total++;
  return true;
}

function acessoLiberado(req, res, next) {
  if (CODIGO_DE_ACESSO && req.get("x-codigo-acesso") !== CODIGO_DE_ACESSO) {
    return res.status(401).json({ erro: "Código de acesso errado. Confira o código e tente de novo.", pedeCodigo: true });
  }
  if (!dentroDoLimite(req.ip)) {
    return res.status(429).json({ erro: `Você já fez ${MAX_POR_DIA} gerações hoje. Volte amanhã para gerar mais.` });
  }
  next();
}

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

const gerar = [temChaveClaude, perfilCompleto, acessoLiberado];

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

app.post("/api/analisar", temChaveClaude, temAutorizacao, acessoLiberado, async (req, res) => {
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

app.post("/api/fotos", temChaveClaude, temAutorizacao, acessoLiberado, async (req, res) => {
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

// Gera uma imagem de fundo pela Pollinations. A chave fica só no servidor;
// sem chave configurada, o botão de imagem gerada nem aparece na tela.
app.post("/api/imagem", acessoLiberado, async (req, res) => {
  if (!CHAVE_IMAGENS) return res.status(503).json({ erro: "A geração de imagens não está ligada neste site." });
  const prompt = String(req.body?.prompt ?? "").slice(0, 600).trim();
  if (!prompt) return res.status(400).json({ erro: "Falta a descrição da imagem." });
  const vertical = req.body?.formato === "story";
  const seed = Number.isInteger(req.body?.seed) ? req.body.seed : Math.floor(Math.random() * 1e6);
  const url = new URL(`${URL_IMAGENS}/image/${encodeURIComponent(prompt)}`);
  url.search = new URLSearchParams({
    model: "flux",
    width: "1080",
    height: vertical ? "1920" : "1350",
    seed: String(seed),
    nologo: "true",
  });
  try {
    const resposta = await fetch(url, {
      headers: { authorization: `Bearer ${CHAVE_IMAGENS}` },
      signal: AbortSignal.timeout(120_000),
    });
    const tipo = resposta.headers.get("content-type") || "";
    if (!resposta.ok || !tipo.startsWith("image/")) {
      console.error("Pollinations respondeu", resposta.status, (await resposta.text()).slice(0, 300));
      const semSaldo = resposta.status === 402 || resposta.status === 429;
      return res.status(502).json({
        erro: semSaldo
          ? "Acabou o saldo grátis de imagens por hoje. Use uma foto sua ou o fundo com as cores."
          : "Não consegui gerar a imagem agora. Tente de novo ou use uma foto sua.",
      });
    }
    res.set("content-type", tipo);
    res.send(Buffer.from(await resposta.arrayBuffer()));
  } catch (erro) {
    console.error("Erro ao gerar imagem:", erro.message);
    res.status(502).json({ erro: "Não consegui gerar a imagem agora. Tente de novo ou use uma foto sua." });
  }
});

app.listen(PORTA, () => {
  console.log(`Site rodando em http://localhost:${PORTA}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Atenção: ANTHROPIC_API_KEY não configurada. Veja o README.");
  }
});
