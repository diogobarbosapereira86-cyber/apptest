// Lê o site e o perfil do Instagram que o dono informou, para a análise do
// negócio. Só busca endereços públicos (nada da rede interna do servidor) e
// devolve um texto curto, sem HTML.

import { lookup } from "node:dns/promises";
import net from "node:net";

const TEMPO_LIMITE_MS = 10_000;
const TAMANHO_MAXIMO = 2_000_000;
const TEXTO_MAXIMO = 15_000;

function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return ipPrivado(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function enderecoPublico(url) {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.username || url.password) return false;
  const enderecos = await lookup(url.hostname, { all: true });
  return enderecos.length > 0 && enderecos.every((e) => !ipPrivado(e.address));
}

export function normalizarSite(valor) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  try {
    return new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return null;
  }
}

export function normalizarInstagram(valor) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  const usuario = bruto
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(usuario) ? usuario : null;
}

async function baixarHtml(urlInicial) {
  let url = urlInicial;
  // Segue até 3 redirecionamentos, conferindo cada destino.
  for (let i = 0; i < 4; i++) {
    if (!(await enderecoPublico(url))) throw new Error("endereço não permitido");
    const resposta = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; leitor-de-perfil/1.0)", accept: "text/html" },
    });
    if (resposta.status >= 300 && resposta.status < 400 && resposta.headers.get("location")) {
      url = new URL(resposta.headers.get("location"), url);
      continue;
    }
    if (!resposta.ok) throw new Error(`status ${resposta.status}`);
    const corpo = await resposta.arrayBuffer();
    return new TextDecoder().decode(corpo.slice(0, TAMANHO_MAXIMO));
  }
  throw new Error("redirecionamentos demais");
}

function meta(html, nome) {
  const padrao = new RegExp(
    `<meta[^>]+(?:property|name)=["']${nome}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${nome}["']`,
    "i",
  );
  const achado = html.match(padrao);
  return decodificar(achado?.[1] ?? achado?.[2] ?? "");
}

function decodificar(texto) {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function textoDaPagina(html) {
  const titulo = decodificar(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const descricao = meta(html, "description") || meta(html, "og:description");
  const corpo = decodificar(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return [titulo && `Título: ${titulo}`, descricao && `Descrição: ${descricao}`, corpo]
    .filter(Boolean)
    .join("\n")
    .slice(0, TEXTO_MAXIMO);
}

export async function lerSite(valor) {
  const url = normalizarSite(valor);
  if (!url) return { lido: false, texto: "" };
  try {
    return { lido: true, texto: textoDaPagina(await baixarHtml(url)) };
  } catch (erro) {
    console.warn("Não consegui ler o site:", erro.message);
    return { lido: false, texto: "" };
  }
}

// O Instagram mostra pouco para quem não está logado: normalmente só o nome,
// a bio e os números de seguidores e posts, que vêm nas tags "og".
export async function lerInstagram(valor) {
  const usuario = normalizarInstagram(valor);
  if (!usuario) return { lido: false, texto: "" };
  try {
    const html = await baixarHtml(new URL(`https://www.instagram.com/${usuario}/`));
    const texto = [meta(html, "og:title"), meta(html, "og:description"), meta(html, "description")]
      .filter(Boolean)
      .join("\n");
    return { lido: Boolean(texto), texto };
  } catch (erro) {
    console.warn("Não consegui ler o Instagram:", erro.message);
    return { lido: false, texto: "" };
  }
}
