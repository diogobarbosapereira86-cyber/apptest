import { test } from "node:test";
import assert from "node:assert/strict";
import { descreverPeriodo, diasDaSemana, frequenciaDoFeed, segundaValida } from "../lib/datas.js";

test("a semana tem 7 dias, de segunda a domingo", () => {
  const dias = diasDaSemana("2026-10-26", 3);
  assert.equal(dias.length, 7);
  assert.equal(dias[0].data, "2026-10-26");
  assert.equal(dias[0].diaDaSemana, "segunda-feira");
  assert.equal(dias[6].data, "2026-11-01");
  assert.equal(dias[6].diaDaSemana, "domingo");
});

test("3 posts no feed caem em terça, quinta e sábado", () => {
  const comFeed = diasDaSemana("2026-10-26", 3).filter((d) => d.temFeed).map((d) => d.diaDaSemana);
  assert.deepEqual(comFeed, ["terça-feira", "quinta-feira", "sábado"]);
});

test("frequência fora do intervalo é ajustada", () => {
  assert.equal(frequenciaDoFeed(0), 1);
  assert.equal(frequenciaDoFeed(99), 7);
  assert.equal(frequenciaDoFeed("abc"), 3);
  assert.equal(frequenciaDoFeed(undefined), 3);
});

test("só aceita uma segunda-feira válida", () => {
  assert.ok(segundaValida("2026-10-26"));
  assert.ok(!segundaValida("2026-10-27"));
  assert.ok(!segundaValida("2026-02-30"));
  assert.ok(!segundaValida("26/10/2026"));
  assert.ok(!segundaValida(undefined));
});

test("descreve o período em português", () => {
  assert.equal(descreverPeriodo("2026-10-26"), "de 26 de outubro a 1 de novembro");
});
