// Banco de dados das contas e sessões de login.
// Com DATABASE_URL (Postgres, como Neon ou Render), usa o Postgres.
// Sem ela, usa um arquivo SQLite local em dados/app.db, bom para testar no computador.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL DEFAULT '',
    senha_hash TEXT,
    google_id TEXT UNIQUE,
    criado_em TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em BIGINT NOT NULL
  )`,
];

async function abrirPostgres(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    tipo: "postgres",
    async consultar(sql, params = []) {
      return (await pool.query(sql, params)).rows;
    },
    fechar: () => pool.end(),
  };
}

async function abrirSqlite(arquivo) {
  const { DatabaseSync } = await import("node:sqlite");
  if (arquivo !== ":memory:") mkdirSync(dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec("PRAGMA foreign_keys = ON");
  return {
    tipo: "sqlite",
    // As consultas usam $1, $2... como no Postgres; o SQLite entende ?1, ?2...
    async consultar(sql, params = []) {
      const comando = db.prepare(sql.replace(/\$(\d+)/g, "?$1"));
      return /^\s*(SELECT|.*RETURNING)/is.test(sql) ? comando.all(...params) : (comando.run(...params), []);
    },
    fechar: async () => db.close(),
  };
}

export async function abrirBanco({ url = process.env.DATABASE_URL, arquivo = process.env.ARQUIVO_BANCO || "dados/app.db" } = {}) {
  const banco = url ? await abrirPostgres(url) : await abrirSqlite(arquivo);
  for (const tabela of TABELAS) await banco.consultar(tabela);
  return {
    tipo: banco.tipo,
    fechar: banco.fechar,

    async usuarioPorEmail(email) {
      return (await banco.consultar("SELECT * FROM usuarios WHERE email = $1", [email]))[0] ?? null;
    },
    async usuarioPorGoogle(googleId) {
      return (await banco.consultar("SELECT * FROM usuarios WHERE google_id = $1", [googleId]))[0] ?? null;
    },
    async criarUsuario({ id, email, nome, senhaHash = null, googleId = null }) {
      await banco.consultar(
        "INSERT INTO usuarios (id, email, nome, senha_hash, google_id, criado_em) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, email, nome, senhaHash, googleId, new Date().toISOString()],
      );
      return { id, email, nome, senha_hash: senhaHash, google_id: googleId };
    },
    async ligarGoogle(usuarioId, googleId) {
      await banco.consultar("UPDATE usuarios SET google_id = $1 WHERE id = $2", [googleId, usuarioId]);
    },

    async criarSessao(tokenHash, usuarioId, expiraEm) {
      await banco.consultar("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, $3)", [
        tokenHash,
        usuarioId,
        expiraEm,
      ]);
    },
    async usuarioDaSessao(tokenHash, agora = Date.now()) {
      const linhas = await banco.consultar(
        "SELECT u.id, u.email, u.nome FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = $1 AND s.expira_em > $2",
        [tokenHash, agora],
      );
      return linhas[0] ?? null;
    },
    async apagarSessao(tokenHash) {
      await banco.consultar("DELETE FROM sessoes WHERE token_hash = $1", [tokenHash]);
    },
    async apagarSessoesVencidas(agora = Date.now()) {
      await banco.consultar("DELETE FROM sessoes WHERE expira_em <= $1", [agora]);
    },
  };
}
