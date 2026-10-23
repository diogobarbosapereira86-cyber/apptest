import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarInstagram, normalizarSite, textoDaPagina } from "../lib/pagina.js";

test("aceita o @ do Instagram em vários formatos", () => {
  assert.equal(normalizarInstagram("@cantinho.da_vo"), "cantinho.da_vo");
  assert.equal(normalizarInstagram("https://www.instagram.com/cantinho/?hl=pt"), "cantinho");
  assert.equal(normalizarInstagram("cantinho"), "cantinho");
  assert.equal(normalizarInstagram("não é um @"), null);
  assert.equal(normalizarInstagram(""), null);
});

test("completa o endereço do site", () => {
  assert.equal(normalizarSite("cantinho.com.br")?.href, "https://cantinho.com.br/");
  assert.equal(normalizarSite("http://cantinho.com.br/menu")?.href, "http://cantinho.com.br/menu");
  assert.equal(normalizarSite(""), null);
});

test("tira o HTML e mantém o texto", () => {
  const html = `<html><head><title>Cantinho &amp; Cia</title>
    <meta name="description" content="Comida caseira"><style>p{}</style></head>
    <body><script>alert(1)</script><p>Feijoada R$ 39,90</p><p>PF R$ 24,90</p></body></html>`;
  const texto = textoDaPagina(html);
  assert.match(texto, /Título: Cantinho & Cia/);
  assert.match(texto, /Descrição: Comida caseira/);
  assert.match(texto, /Feijoada R\$ 39,90/);
  assert.doesNotMatch(texto, /alert|p\{\}/);
});
