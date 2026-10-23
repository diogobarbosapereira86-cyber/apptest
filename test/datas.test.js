import { test } from "node:test";
import assert from "node:assert/strict";
import { datasDoMes, mesValido, nomeDoMes } from "../lib/datas.js";

test("3 posts por semana caem em terça, quinta e sábado", () => {
  const datas = datasDoMes("2026-11", 3);
  assert.ok(datas.every((d) => ["terça-feira", "quinta-feira", "sábado"].includes(d.diaDaSemana)));
  assert.equal(datas[0].data, "2026-11-03");
  assert.equal(datas[0].diaDaSemana, "terça-feira");
  assert.equal(datas.length, 12);
});

test("todo dia gera um post por dia do mês", () => {
  assert.equal(datasDoMes("2026-02", 7).length, 28);
  assert.equal(datasDoMes("2028-02", 7).length, 29);
});

test("frequência fora do intervalo é ajustada", () => {
  assert.equal(datasDoMes("2026-11", 0).length, datasDoMes("2026-11", 1).length);
  assert.equal(datasDoMes("2026-11", 99).length, 30);
  assert.equal(datasDoMes("2026-11", "abc").length, datasDoMes("2026-11", 3).length);
});

test("valida o mês", () => {
  assert.ok(mesValido("2026-12"));
  assert.ok(!mesValido("2026-13"));
  assert.ok(!mesValido("12/2026"));
  assert.ok(!mesValido(undefined));
});

test("nome do mês em português", () => {
  assert.equal(nomeDoMes("2026-11"), "novembro de 2026");
});
