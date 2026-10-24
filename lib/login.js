// Login com e-mail e senha ou com a conta Google. A sessão fica num cookie
// httpOnly; no banco guardamos só o hash do token.

import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const scryptAsync = promisify(scrypt);
const DURACAO_SESSAO = 30 * 24 * 60 * 60 * 1000;
const COOKIE = "sessao";
const MAX_TENTATIVAS = 10;
const JANELA_TENTATIVAS = 15 * 60 * 1000;

export async function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha, sal, 64);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export async function senhaConfere(senha, guardado) {
  const [tipo, sal, hash] = String(guardado ?? "").split("$");
  if (tipo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = await scryptAsync(senha, Buffer.from(sal, "base64"), esperado.length);
  return timingSafeEqual(calculado, esperado);
}

export function normalizarEmail(email) {
  const limpo = String(email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) && limpo.length <= 200 ? limpo : null;
}

const hashDoToken = (token) => createHash("sha256").update(token).digest("hex");

function lerCookie(req, nome) {
  for (const parte of (req.get("cookie") || "").split(";")) {
    const [chave, ...valor] = parte.trim().split("=");
    if (chave === nome) return decodeURIComponent(valor.join("="));
  }
  return null;
}

function publico(usuario) {
  return { id: usuario.id, email: usuario.email, nome: usuario.nome };
}

// Confere o token que o botão "Entrar com o Google" devolve no navegador.
export function verificadorGoogle(clientId, jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))) {
  return async (credencial) => {
    const { payload } = await jwtVerify(credencial, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      throw new Error("Conta Google sem e-mail verificado");
    }
    return { googleId: payload.sub, email: payload.email.toLowerCase(), nome: payload.name || "" };
  };
}

export function criarLogin({ banco, convite = "", googleClientId = "", verificarGoogle } = {}) {
  verificarGoogle ??= googleClientId ? verificadorGoogle(googleClientId) : null;
  const rotas = express.Router();
  const tentativas = new Map();

  function bloqueado(chave) {
    const registro = tentativas.get(chave);
    if (!registro || Date.now() - registro.inicio > JANELA_TENTATIVAS) return false;
    return registro.total >= MAX_TENTATIVAS;
  }
  function errou(chave) {
    const registro = tentativas.get(chave);
    if (!registro || Date.now() - registro.inicio > JANELA_TENTATIVAS) tentativas.set(chave, { inicio: Date.now(), total: 1 });
    else registro.total++;
  }

  async function abrirSessao(req, res, usuario) {
    const token = randomBytes(32).toString("base64url");
    await banco.criarSessao(hashDoToken(token), usuario.id, Date.now() + DURACAO_SESSAO);
    const seguro = req.secure ? "; Secure" : "";
    res.set(
      "set-cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO_SESSAO / 1000}${seguro}`,
    );
    res.json({ usuario: publico(usuario) });
  }

  const conviteConfere = (valor) => !convite || String(valor ?? "").trim() === convite;
  const erroConvite = { erro: "Para criar a conta, digite o código de convite que você recebeu.", pedeConvite: true };

  async function exigirLogin(req, res, next) {
    const token = lerCookie(req, COOKIE);
    const usuario = token ? await banco.usuarioDaSessao(hashDoToken(token)).catch(() => null) : null;
    if (!usuario) return res.status(401).json({ erro: "Entre na sua conta para continuar.", pedeLogin: true });
    req.usuario = usuario;
    next();
  }

  rotas.get("/api/eu", exigirLogin, (req, res) => res.json({ usuario: publico(req.usuario) }));

  rotas.post("/api/conta", async (req, res, next) => {
    try {
      const email = normalizarEmail(req.body?.email);
      const senha = String(req.body?.senha ?? "");
      const nome = String(req.body?.nome ?? "").trim().slice(0, 120);
      if (!email) return res.status(400).json({ erro: "Confira o e-mail." });
      if (senha.length < 8 || senha.length > 200) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
      if (!conviteConfere(req.body?.convite)) return res.status(403).json(erroConvite);
      if (await banco.usuarioPorEmail(email)) {
        return res.status(409).json({ erro: "Já existe uma conta com esse e-mail. Use “Entrar”." });
      }
      const usuario = await banco.criarUsuario({ id: randomUUID(), email, nome, senhaHash: await gerarHashSenha(senha) });
      await abrirSessao(req, res, usuario);
    } catch (erro) {
      next(erro);
    }
  });

  rotas.post("/api/entrar", async (req, res, next) => {
    try {
      const email = normalizarEmail(req.body?.email);
      const chave = `${req.ip}|${email}`;
      if (bloqueado(chave)) {
        return res.status(429).json({ erro: "Muitas tentativas. Espere 15 minutos e tente de novo." });
      }
      const usuario = email ? await banco.usuarioPorEmail(email) : null;
      const certa = usuario?.senha_hash ? await senhaConfere(String(req.body?.senha ?? ""), usuario.senha_hash) : false;
      if (!certa) {
        errou(chave);
        const soGoogle = usuario && !usuario.senha_hash;
        return res.status(401).json({
          erro: soGoogle ? "Essa conta entra pelo botão do Google." : "E-mail ou senha errados.",
        });
      }
      tentativas.delete(chave);
      await abrirSessao(req, res, usuario);
    } catch (erro) {
      next(erro);
    }
  });

  rotas.post("/api/entrar-google", async (req, res, next) => {
    if (!verificarGoogle) return res.status(503).json({ erro: "O login com Google não está ligado neste site." });
    let dados;
    try {
      dados = await verificarGoogle(String(req.body?.credencial ?? ""));
    } catch (erro) {
      console.error("Login Google recusado:", erro.message);
      return res.status(401).json({ erro: "Não consegui confirmar a sua conta Google. Tente de novo." });
    }
    try {
      let usuario = await banco.usuarioPorGoogle(dados.googleId);
      if (!usuario) {
        usuario = await banco.usuarioPorEmail(dados.email);
        if (usuario) {
          // Já tinha conta com senha e o mesmo e-mail (verificado pelo Google): junta as duas.
          await banco.ligarGoogle(usuario.id, dados.googleId);
        } else {
          if (!conviteConfere(req.body?.convite)) return res.status(403).json(erroConvite);
          usuario = await banco.criarUsuario({ id: randomUUID(), email: dados.email, nome: dados.nome, googleId: dados.googleId });
        }
      }
      await abrirSessao(req, res, usuario);
    } catch (erro) {
      next(erro);
    }
  });

  rotas.post("/api/sair", async (req, res) => {
    const token = lerCookie(req, COOKIE);
    if (token) await banco.apagarSessao(hashDoToken(token)).catch(() => {});
    res.set("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  return { rotas, exigirLogin };
}
