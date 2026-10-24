import { test } from "node:test";
import assert from "node:assert/strict";
import { limparIdsDeFotos } from "../lib/conteudo.js";

const ids = ["fmvljk3i9a30jfc", "fmvljk3ik4goru2", "fmvljj569u8ee06"];

test("tira os ids de foto dos textos que o dono lê", () => {
  const dicas = {
    dicas: [
      {
        passos: [
          "Suba fotos reais: a calçada com a árvore (id fmvljk3i9a30jfc), o salão (id fmvljk3ik4goru2) e o prato gratinado (fmvljj569u8ee06).",
          "Use a foto fmvljk3ik4goru2 no perfil.",
        ],
      },
    ],
  };
  assert.deepEqual(limparIdsDeFotos(dicas, ids).dicas[0].passos, [
    "Suba fotos reais: a calçada com a árvore, o salão e o prato gratinado.",
    "Use a foto no perfil.",
  ]);
});

test("mantém o id nos campos de id e não mexe sem fotos", () => {
  const post = { titulo: "Prato do dia", foto_sugerida: "fmvljk3ik4goru2", fotos: [{ id: "fmvljj569u8ee06", descricao: "Prato" }] };
  assert.deepEqual(limparIdsDeFotos(post, ids), post);
  assert.deepEqual(limparIdsDeFotos(post, []), post);
});
