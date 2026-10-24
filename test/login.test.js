import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { abrirBanco } from "../lib/banco.js";
import { criarLogin, gerarHashSenha, normalizarEmail, senhaConfere } from "../lib/login.js";

let servidor;
let base;

before(async () => {
  const banco = await abrirBanco({ url: "", arquivo: ":memory:" });
  const { rotas, exigirLogin } = criarLogin({
    banco,
    convite: "convite-123",
    verificarGoogle: async (credencial) => {
      if (credencial !== "token-bom") throw new Error("token inválido");
      return { googleId: "g-1", email: "maria@exemplo.com", nome: "Maria" };
    },
  });
  const app = express();
  app.use(express.json());
  app.use(rotas);
  app.get("/api/protegida", exigirLogin, (req, res) => res.json({ email: req.usuario.email }));
  await new Promise((resolve) => (servidor = app.listen(0, resolve)));
  base = `http://localhost:${servidor.address().port}`;
});

after(() => servidor.close());

async function post(caminho, corpo, cookie) {
  const resposta = await fetch(base + caminho, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(corpo),
  });
  const setCookie = resposta.headers.get("set-cookie");
  return { status: resposta.status, dados: await resposta.json(), cookie: setCookie?.split(";")[0] };
}

test("senha: hash confere só com a senha certa", async () => {
  const hash = await gerarHashSenha("segredo-123");
  assert.equal(await senhaConfere("segredo-123", hash), true);
  assert.equal(await senhaConfere("outra-senha", hash), false);
  assert.equal(await senhaConfere("qualquer", "lixo"), false);
  assert.equal(normalizarEmail("  Maria@Exemplo.COM "), "maria@exemplo.com");
  assert.equal(normalizarEmail("sem-arroba"), null);
});

test("criar conta pede convite, abre sessão e protege as rotas", async () => {
  const semConvite = await post("/api/conta", { nome: "Maria", email: "maria@exemplo.com", senha: "segredo-123" });
  assert.equal(semConvite.status, 403);
  assert.equal(semConvite.dados.pedeConvite, true);

  const criada = await post("/api/conta", { nome: "Maria", email: "Maria@exemplo.com", senha: "segredo-123", convite: "convite-123" });
  assert.equal(criada.status, 200);
  assert.match(criada.cookie, /^sessao=/);

  assert.equal((await fetch(`${base}/api/protegida`)).status, 401);
  const protegida = await fetch(`${base}/api/protegida`, { headers: { cookie: criada.cookie } });
  assert.deepEqual(await protegida.json(), { email: "maria@exemplo.com" });

  const repetida = await post("/api/conta", { email: "maria@exemplo.com", senha: "segredo-123", convite: "convite-123" });
  assert.equal(repetida.status, 409);

  await post("/api/sair", {}, criada.cookie);
  assert.equal((await fetch(`${base}/api/protegida`, { headers: { cookie: criada.cookie } })).status, 401);
});

test("entrar com senha errada falha e com a certa funciona", async () => {
  assert.equal((await post("/api/entrar", { email: "maria@exemplo.com", senha: "errada-123" })).status, 401);
  const certa = await post("/api/entrar", { email: "maria@exemplo.com", senha: "segredo-123" });
  assert.equal(certa.status, 200);
  assert.equal(certa.dados.usuario.email, "maria@exemplo.com");
});

test("Google junta com a conta do mesmo e-mail e conta nova pede convite", async () => {
  assert.equal((await post("/api/entrar-google", { credencial: "token-ruim" })).status, 401);
  const google = await post("/api/entrar-google", { credencial: "token-bom" });
  assert.equal(google.status, 200);
  assert.equal(google.dados.usuario.email, "maria@exemplo.com");
});
