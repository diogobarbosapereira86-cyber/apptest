import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { ErroDeGeracao, gerarCalendario, gerarDicas, gerarIdeias } from "./lib/conteudo.js";
import { mesValido } from "./lib/datas.js";

const PORTA = Number(process.env.PORT) || 3000;
const CODIGO_DE_ACESSO = (process.env.CODIGO_DE_ACESSO || "").trim();
const MAX_POR_DIA = Number(process.env.MAX_GERACOES_POR_DIA) || 30;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

app.get("/api/config", (req, res) => {
  res.json({
    pedeCodigo: Boolean(CODIGO_DE_ACESSO),
    chaveConfigurada: Boolean(process.env.ANTHROPIC_API_KEY),
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

function protegido(req, res, next) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      erro: "O site ainda não tem a chave da API do Claude. Veja no README como configurar a ANTHROPIC_API_KEY.",
    });
  }
  if (CODIGO_DE_ACESSO && req.get("x-codigo-acesso") !== CODIGO_DE_ACESSO) {
    return res.status(401).json({ erro: "Código de acesso errado. Confira o código e tente de novo.", pedeCodigo: true });
  }
  if (!perfilValido(req.body?.perfil)) {
    return res.status(400).json({ erro: "Preencha os dados do seu negócio antes de gerar conteúdo." });
  }
  if (!dentroDoLimite(req.ip)) {
    return res.status(429).json({ erro: `Você já fez ${MAX_POR_DIA} gerações hoje. Volte amanhã para gerar mais.` });
  }
  next();
}

function perfilValido(perfil) {
  return Boolean(perfil && typeof perfil === "object" && perfil.nome && perfil.tipo && perfil.produtos);
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
  if (erro instanceof Anthropic.APIError) {
    console.error("Erro da API do Claude:", erro.status, erro.message);
    return res.status(502).json({ erro: "A IA está com problema no momento. Tente de novo em alguns minutos." });
  }
  console.error(erro);
  return res.status(500).json({ erro: "Algo deu errado. Tente de novo." });
}

app.post("/api/calendario", protegido, async (req, res) => {
  const { perfil, mes } = req.body;
  if (!mesValido(mes)) return res.status(400).json({ erro: "Escolha um mês válido." });
  try {
    res.json(await gerarCalendario(perfil, mes));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/ideias", protegido, async (req, res) => {
  const titulos = Array.isArray(req.body.titulosExistentes) ? req.body.titulosExistentes : [];
  try {
    res.json(await gerarIdeias(req.body.perfil, titulos));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.post("/api/dicas", protegido, async (req, res) => {
  try {
    res.json(await gerarDicas(req.body.perfil));
  } catch (erro) {
    responderErro(res, erro);
  }
});

app.listen(PORTA, () => {
  console.log(`Site rodando em http://localhost:${PORTA}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Atenção: ANTHROPIC_API_KEY não configurada. Veja o README.");
  }
});
