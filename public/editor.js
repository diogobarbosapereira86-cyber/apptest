// Editor de arte: monta post de foto, carrossel, Reels e story no navegador.
// Cada formato tem tamanho, quantidade de telas e regras próprias. A mídia
// vem das fotos guardadas do dono, da IA (Gemini) ou de um arquivo enviado só
// para esta arte, que não é guardado.

const FORMATOS = {
  post: {
    titulo: "Criar post de foto",
    largura: 1080,
    altura: 1350,
    aceitaVideo: false,
    maxQuadros: 1,
    posTexto: "baixo",
    assinatura: true,
    nomeQuadro: "Foto",
    ajuda: "Foto do feed em 1080 × 1350 (4:5), o tamanho que ocupa mais espaço na tela do celular.",
  },
  carrossel: {
    titulo: "Criar carrossel",
    largura: 1080,
    altura: 1350,
    aceitaVideo: false,
    maxQuadros: 20,
    posTexto: "baixo",
    assinatura: true,
    nomeQuadro: "Slide",
    ajuda: "Até 20 slides de 1080 × 1350. O primeiro é a capa: ele precisa dar vontade de arrastar para o lado.",
  },
  reels: {
    titulo: "Criar Reels",
    largura: 1080,
    altura: 1920,
    aceitaVideo: true,
    maxQuadros: 1,
    maxSegundos: 90,
    segundosDaFoto: 7,
    posTexto: "meio",
    assinatura: false,
    nomeQuadro: "Vídeo",
    ajuda: "Vídeo vertical de 1080 × 1920, até 90 segundos. Com uma foto, o app faz um vídeo de 7 segundos com movimento suave.",
  },
  story: {
    titulo: "Criar story",
    largura: 1080,
    altura: 1920,
    aceitaVideo: true,
    maxQuadros: 10,
    maxSegundos: 60,
    posTexto: "cima",
    assinatura: false,
    nomeQuadro: "Tela",
    ajuda: "Cada tela tem 1080 × 1920, com foto ou vídeo de até 60 segundos. A figurinha (enquete, pergunta) você coloca no próprio Instagram.",
  },
};

// Faixas que o Instagram cobre com botões e legenda (em pixels de 1080 × 1920).
const AREAS_COBERTAS = {
  story: { cima: 250, baixo: 340, direita: 0 },
  reels: { cima: 200, baixo: 420, direita: 150 },
};

const editor = {
  item: null,
  formato: "post",
  quadros: [],
  atual: 0,
  exportando: false,
  animacao: null,
  fotosCarregadas: new Map(),
};

const telaArte = $("#arte");
const pincel = telaArte.getContext("2d");
const fonteTexto = `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

function formatoDoItem(item, tipo) {
  if (tipo === "story") return "story";
  const formato = String(item.formato || "").toLowerCase();
  if (formato.startsWith("reel")) return "reels";
  if (formato.startsWith("carross")) return "carrossel";
  return "post";
}

function novoQuadro(texto, extra = {}) {
  return { texto: texto || "", midia: null, zoom: 1, dx: 0, dy: 0, posTexto: FORMATOS[editor.formato].posTexto, ...extra };
}

function quadrosIniciais(item, formato) {
  if (formato === "carrossel") {
    const slides = item.slides?.length ? item.slides : [item.titulo_arte || item.titulo || ""];
    return slides.slice(0, FORMATOS.carrossel.maxQuadros).map((texto) => novoQuadro(texto));
  }
  if (formato === "story") {
    const telas = item.telas?.length ? item.telas : [{ texto_na_tela: item.titulo_arte || item.tema }];
    return telas
      .slice(0, FORMATOS.story.maxQuadros)
      .map((tela) => novoQuadro(tela.texto_na_tela, { dica: tela.mostrar, figurinha: tela.interacao }));
  }
  return [novoQuadro(item.titulo_arte || item.titulo || item.tema || "")];
}

function quadroAtual() {
  return editor.quadros[editor.atual];
}

// ---------- Mídia ----------

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => reject(new Error("Não consegui abrir essa imagem."));
    imagem.src = src;
  });
}

function esperarEvento(alvo, nome) {
  return new Promise((resolve, reject) => {
    alvo.addEventListener(nome, resolve, { once: true });
    alvo.addEventListener("error", () => reject(new Error("Não consegui abrir esse arquivo.")), { once: true });
  });
}

async function criarVideo(url, { mudo = true } = {}) {
  const video = document.createElement("video");
  video.src = url;
  video.muted = mudo;
  video.loop = mudo;
  video.playsInline = true;
  video.preload = "auto";
  await esperarEvento(video, "loadeddata");
  return video;
}

function tamanhoDaFonte(midia) {
  const fonte = midia.fonte;
  return midia.tipo === "video"
    ? { w: fonte.videoWidth, h: fonte.videoHeight }
    : { w: fonte.naturalWidth || fonte.width, h: fonte.naturalHeight || fonte.height };
}

async function fotoGuardada(id) {
  if (!editor.fotosCarregadas.has(id)) {
    const guardada = await fotosDb.pegar(id);
    editor.fotosCarregadas.set(id, guardada ? await carregarImagem(guardada.dataUrl) : null);
  }
  return editor.fotosCarregadas.get(id);
}

function pararVideoDoQuadro(quadro) {
  if (quadro?.midia?.tipo === "video") quadro.midia.fonte.pause();
}

function definirMidia(quadro, midia) {
  if (quadro.midia?.url && quadro.midia.url !== midia?.url && quadro.midia.origem !== "banco") {
    pararVideoDoQuadro(quadro);
    // Arquivos enviados só para esta arte saem da memória quando trocados.
    if (!editor.quadros.some((q) => q !== quadro && q.midia?.url === quadro.midia.url)) URL.revokeObjectURL(quadro.midia.url);
  }
  quadro.midia = midia;
  quadro.zoom = 1;
  quadro.dx = 0;
  quadro.dy = 0;
  if (midia?.tipo === "video" && quadro === quadroAtual()) midia.fonte.play().catch(() => {});
  atualizarControles();
  desenharPrevia();
}

async function usarFotoGuardada(id) {
  const imagem = await fotoGuardada(id);
  if (!imagem) return;
  definirMidia(quadroAtual(), { tipo: "imagem", fonte: imagem, origem: "banco", fotoId: id });
  marcarMiniatura();
}

async function usarArquivo(arquivo) {
  const formato = FORMATOS[editor.formato];
  const ehVideo = arquivo.type.startsWith("video/");
  if (!ehVideo && !arquivo.type.startsWith("image/")) throw new Error("Escolha uma foto ou um vídeo.");
  if (ehVideo && !formato.aceitaVideo) {
    throw new Error(`${formato.titulo.replace("Criar ", "O ")} aceita só foto. Para vídeo, use um Reels ou um story.`);
  }
  const url = URL.createObjectURL(arquivo);
  try {
    if (ehVideo) {
      const video = await criarVideo(url);
      definirMidia(quadroAtual(), { tipo: "video", fonte: video, origem: "subir", url });
      if (video.duration > formato.maxSegundos + 0.5) {
        mostrarNota(
          `Esse vídeo tem ${Math.round(video.duration)} segundos. O ${editor.formato === "story" ? "story" : "Reels"} aceita até ${formato.maxSegundos}, então só os primeiros ${formato.maxSegundos} segundos entram.`,
          "atencao",
        );
      }
    } else {
      definirMidia(quadroAtual(), { tipo: "imagem", fonte: await carregarImagem(url), origem: "subir", url });
    }
  } catch (erro) {
    URL.revokeObjectURL(url);
    throw ehVideo ? new Error("Não consegui abrir esse vídeo. Tente um arquivo MP4 ou MOV gravado no celular.") : erro;
  }
}

async function gerarComIa() {
  const quadro = quadroAtual();
  const formato = FORMATOS[editor.formato];
  const botaoIa = $("#botao-gerar-ia");
  $("#carregando-imagem").hidden = false;
  botaoIa.disabled = true;
  mostrarNota("");
  try {
    const cena = quadro.dica ? `. Scene to show: ${quadro.dica}` : "";
    const resposta = await fetch("/api/imagem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `${editor.item.prompt_imagem || editor.item.titulo || editor.item.tema}${cena}`.slice(0, 600),
        formato: formato.altura > formato.largura ? "story" : "feed",
      }),
    });
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      if (dados.pedeLogin) mostrarLogin();
      throw new Error(dados.erro || "Não consegui gerar a imagem agora.");
    }
    const url = URL.createObjectURL(await resposta.blob());
    definirMidia(quadro, { tipo: "imagem", fonte: await carregarImagem(url), origem: "ia", url });
    botaoIa.textContent = "Gerar outra imagem";
  } catch (erro) {
    mostrarNota(erro.message, "erro");
  } finally {
    $("#carregando-imagem").hidden = true;
    botaoIa.disabled = false;
  }
}

// ---------- Desenho ----------

function quebrarTexto(contexto, texto, larguraMaxima) {
  const linhas = [];
  for (const paragrafo of texto.split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (contexto.measureText(tentativa).width > larguraMaxima && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

function posicaoDaMidia(quadro, L, A, zoomExtra = 1) {
  if (!quadro.midia) return null;
  const { w, h } = tamanhoDaFonte(quadro.midia);
  if (!w || !h) return null;
  const escala = Math.max(L / w, A / h) * quadro.zoom * zoomExtra;
  const largura = w * escala;
  const altura = h * escala;
  return { x: (L - largura) / 2 + quadro.dx, y: (A - altura) / 2 + quadro.dy, largura, altura };
}

// Fundo desfocado para quando a foto não cobre a arte inteira ("mostrar inteira").
const miniTela = document.createElement("canvas");
function fundoDesfocado(contexto, fonte, w, h, L, A) {
  miniTela.width = Math.round(L / 24);
  miniTela.height = Math.round(A / 24);
  const mini = miniTela.getContext("2d");
  const escala = Math.max(miniTela.width / w, miniTela.height / h);
  mini.drawImage(fonte, (miniTela.width - w * escala) / 2, (miniTela.height - h * escala) / 2, w * escala, h * escala);
  contexto.imageSmoothingEnabled = true;
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(miniTela, 0, 0, L, A);
  contexto.fillStyle = "rgba(11, 15, 20, 0.35)";
  contexto.fillRect(0, 0, L, A);
}

function desenharTexto(contexto, quadro, L, A) {
  const formato = FORMATOS[editor.formato];
  const cobertas = AREAS_COBERTAS[editor.formato] || { cima: 0, baixo: 0, direita: 0 };
  const texto = quadro.texto.trim();
  const margem = 84;
  const larguraTexto = L - margem * 2 - cobertas.direita;
  const perfil = ler(CHAVES.perfil, {});
  const assinatura = formato.assinatura ? (perfil.instagram || perfil.nome || "").toUpperCase() : "";

  let tamanho = 92;
  let linhas = [];
  if (texto) {
    do {
      contexto.font = `800 ${tamanho}px ${fonteTexto}`;
      linhas = quebrarTexto(contexto, texto, larguraTexto);
      tamanho -= 6;
    } while (linhas.length > 5 && tamanho > 44);
    tamanho += 6;
  }
  const alturaLinha = tamanho * 1.18;
  const alturaBloco = linhas.length * alturaLinha;

  let topo;
  if (quadro.posTexto === "cima") topo = Math.max(cobertas.cima, 90) + 40;
  else if (quadro.posTexto === "meio") topo = (A - alturaBloco) / 2;
  else topo = A - Math.max(cobertas.baixo, assinatura ? 190 : 120) - alturaBloco;

  if (linhas.length) {
    // Sombra para o texto ficar legível sobre qualquer foto.
    let sombra;
    if (quadro.posTexto === "cima") {
      sombra = contexto.createLinearGradient(0, 0, 0, topo + alturaBloco + 200);
      sombra.addColorStop(0, "rgba(11, 15, 20, 0.88)");
      sombra.addColorStop(1, "rgba(11, 15, 20, 0)");
      contexto.fillStyle = sombra;
      contexto.fillRect(0, 0, L, topo + alturaBloco + 200);
    } else if (quadro.posTexto === "meio") {
      contexto.fillStyle = "rgba(11, 15, 20, 0.55)";
      contexto.fillRect(0, topo - 70, L, alturaBloco + 120);
    } else {
      const inicio = Math.max(0, topo - 260);
      sombra = contexto.createLinearGradient(0, inicio, 0, A);
      sombra.addColorStop(0, "rgba(11, 15, 20, 0)");
      sombra.addColorStop(1, "rgba(11, 15, 20, 0.92)");
      contexto.fillStyle = sombra;
      contexto.fillRect(0, inicio, L, A - inicio);
    }

    contexto.fillStyle = "#D4AF37";
    contexto.fillRect(margem, topo - 28, 96, 8);
    contexto.font = `800 ${tamanho}px ${fonteTexto}`;
    contexto.textBaseline = "alphabetic";
    contexto.fillStyle = "#E5E7EB";
    linhas.forEach((linha, i) => contexto.fillText(linha, margem, topo + (i + 1) * alturaLinha - alturaLinha * 0.2));
  }

  if (assinatura) {
    contexto.font = `600 34px ${fonteTexto}`;
    contexto.fillStyle = "#D4AF37";
    if ("letterSpacing" in contexto) contexto.letterSpacing = "6px";
    const y = quadro.posTexto === "baixo" && linhas.length ? topo + alturaBloco + 70 : A - 90;
    contexto.fillText(assinatura, margem, y);
    if ("letterSpacing" in contexto) contexto.letterSpacing = "0px";
  }
}

// Linhas de ajuda que só aparecem na prévia, nunca no arquivo baixado.
function desenharGuias(contexto, quadro, L, A) {
  const cobertas = AREAS_COBERTAS[editor.formato];
  contexto.save();
  contexto.font = `600 30px ${fonteTexto}`;
  contexto.setLineDash([18, 14]);
  contexto.lineWidth = 4;
  if (cobertas) {
    contexto.fillStyle = "rgba(240, 138, 128, 0.18)";
    contexto.fillRect(0, 0, L, cobertas.cima);
    contexto.fillRect(0, A - cobertas.baixo, L, cobertas.baixo);
    if (cobertas.direita) contexto.fillRect(L - cobertas.direita, cobertas.cima, cobertas.direita, A - cobertas.cima - cobertas.baixo);
    contexto.fillStyle = "#F08A80";
    contexto.fillText("O Instagram cobre esta área", 40, A - cobertas.baixo + 50);
  }
  if (editor.formato === "reels") {
    // No perfil, a capa do Reels aparece cortada no meio.
    const alturaCapa = L * (4 / 3);
    contexto.strokeStyle = "#D4AF37";
    contexto.strokeRect(6, (A - alturaCapa) / 2, L - 12, alturaCapa);
    contexto.fillStyle = "#D4AF37";
    contexto.fillText("Parte que aparece no perfil", 40, (A - alturaCapa) / 2 + 44);
  }
  if (editor.formato === "story" && quadro.figurinha) {
    const y = A - cobertas.baixo - 380;
    contexto.strokeStyle = "#8DB8FA";
    contexto.strokeRect(160, y, L - 320, 240);
    contexto.fillStyle = "#8DB8FA";
    const linhas = quebrarTexto(contexto, `Figurinha: ${quadro.figurinha}`, L - 400);
    linhas.slice(0, 4).forEach((linha, i) => contexto.fillText(linha, 190, y + 60 + i * 42));
  }
  contexto.restore();
}

function desenharQuadro(contexto, quadro, { L, A, guias = false, zoomExtra = 1 }) {
  contexto.fillStyle = "#0B0F14";
  contexto.fillRect(0, 0, L, A);
  const posicao = posicaoDaMidia(quadro, L, A, zoomExtra);
  if (posicao) {
    const { w, h } = tamanhoDaFonte(quadro.midia);
    const cobre = posicao.x <= 0.5 && posicao.y <= 0.5 && posicao.x + posicao.largura >= L - 0.5 && posicao.y + posicao.altura >= A - 0.5;
    if (!cobre) fundoDesfocado(contexto, quadro.midia.fonte, w, h, L, A);
    contexto.drawImage(quadro.midia.fonte, posicao.x, posicao.y, posicao.largura, posicao.altura);
  } else {
    const gradiente = contexto.createLinearGradient(0, 0, L, A);
    gradiente.addColorStop(0, "#0E2E4F");
    gradiente.addColorStop(1, "#0B0F14");
    contexto.fillStyle = gradiente;
    contexto.fillRect(0, 0, L, A);
    if (guias) {
      contexto.fillStyle = "#9DAAB9";
      contexto.font = `600 44px ${fonteTexto}`;
      contexto.textAlign = "center";
      contexto.fillText(FORMATOS[editor.formato].aceitaVideo ? "Escolha uma foto ou vídeo" : "Escolha uma foto", L / 2, A * 0.3);
      contexto.textAlign = "start";
    }
  }
  desenharTexto(contexto, quadro, L, A);
  if (guias) desenharGuias(contexto, quadro, L, A);
}

function desenharPrevia() {
  const quadro = quadroAtual();
  if (!quadro) return;
  desenharQuadro(pincel, quadro, { L: telaArte.width, A: telaArte.height, guias: $("#mostrar-guias").checked });
}

// Redesenha a prévia enquanto um vídeo toca.
function lacoDaPrevia() {
  cancelAnimationFrame(editor.animacao);
  const passo = () => {
    if (!$("#criador").open) return;
    if (quadroAtual()?.midia?.tipo === "video" && !editor.exportando) desenharPrevia();
    editor.animacao = requestAnimationFrame(passo);
  };
  editor.animacao = requestAnimationFrame(passo);
}

// ---------- Controles ----------

function mostrarNota(mensagem, tipo = "") {
  const nota = $("#criador-nota");
  nota.textContent = mensagem;
  nota.className = `nota ${tipo === "erro" ? "erro-texto" : tipo === "atencao" ? "atencao-texto" : ""}`;
}

function marcarMiniatura() {
  const id = quadroAtual()?.midia?.origem === "banco" ? quadroAtual().midia.fotoId : null;
  document.querySelectorAll("#escolha-foto .miniatura").forEach((m) => m.setAttribute("aria-pressed", String(m.dataset.id === id)));
}

function mostrarFonte(fonte) {
  $("#painel-banco").hidden = fonte !== "banco";
  $("#painel-ia").hidden = fonte !== "ia";
  $("#painel-subir").hidden = fonte !== "subir";
}

function atualizarControles() {
  const formato = FORMATOS[editor.formato];
  const quadro = quadroAtual();
  const total = editor.quadros.length;
  const nome = formato.nomeQuadro;

  $("#navegar-quadros").hidden = total <= 1;
  $("#quadro-atual").textContent = `${nome} ${editor.atual + 1} de ${total}`;
  $("#editar-quadros").hidden = formato.maxQuadros <= 1;
  $("#quadro-adicionar").textContent = `+ ${nome}`;
  $("#quadro-adicionar").disabled = total >= formato.maxQuadros;
  $("#quadro-remover").disabled = total <= 1;

  $("#dica-quadro").hidden = !quadro.dica;
  $("#dica-quadro").textContent = quadro.dica ? `O que mostrar: ${quadro.dica}` : "";

  const origem = quadro.midia?.origem || document.querySelector("input[name=fonte]:checked")?.value || "banco";
  document.querySelector(`input[name=fonte][value=${origem}]`).checked = true;
  mostrarFonte(origem);
  marcarMiniatura();
  $("#botao-gerar-ia").textContent = quadro.midia?.origem === "ia" ? "Gerar outra imagem" : "Gerar imagem com o Gemini";

  $("#ajuste-midia").hidden = !quadro.midia;
  $("#zoom").value = String(quadro.zoom);
  $("#video-tocar").hidden = quadro.midia?.tipo !== "video";
  if (quadro.midia?.tipo === "video") $("#video-tocar").textContent = quadro.midia.fonte.paused ? "Tocar vídeo" : "Pausar vídeo";

  $("#texto-arte").value = quadro.texto;
  document.querySelector(`input[name=pos-texto][value=${quadro.posTexto}]`).checked = true;

  const ehVideo = editor.formato === "reels" || quadro.midia?.tipo === "video";
  $("#botao-baixar").textContent =
    total > 1 ? `Baixar ${nome.toLowerCase()} ${editor.atual + 1}` : ehVideo ? "Baixar vídeo" : "Baixar imagem";
  $("#botao-baixar-todos").hidden = total <= 1;
  $("#botao-capa").hidden = editor.formato !== "reels";
  $("#botao-compartilhar").hidden = !podeCompartilhar();
}

function irParaQuadro(indice) {
  pararVideoDoQuadro(quadroAtual());
  editor.atual = (indice + editor.quadros.length) % editor.quadros.length;
  const quadro = quadroAtual();
  if (quadro.midia?.tipo === "video") quadro.midia.fonte.play().catch(() => {});
  atualizarControles();
  desenharPrevia();
}

async function desenharMiniaturas() {
  const perfil = ler(CHAVES.perfil, {});
  const escolha = $("#escolha-foto");
  escolha.replaceChildren();
  for (const foto of perfil.fotos || []) {
    const guardada = await fotosDb.pegar(foto.id);
    if (!guardada) continue;
    const opcao = el("button", "miniatura");
    opcao.type = "button";
    opcao.dataset.id = foto.id;
    opcao.title = foto.descricao;
    opcao.setAttribute("aria-label", foto.descricao);
    const imagem = el("img");
    imagem.src = guardada.dataUrl;
    imagem.alt = "";
    opcao.append(imagem);
    opcao.addEventListener("click", () => usarFotoGuardada(foto.id));
    escolha.append(opcao);
  }
  $("#banco-vazio").hidden = escolha.children.length > 0;
  return [...escolha.children].map((m) => m.dataset.id);
}

async function abrirCriador(item, tipo) {
  pararVideoDoQuadro(quadroAtual());
  editor.item = item;
  editor.formato = formatoDoItem(item, tipo);
  editor.quadros = quadrosIniciais(item, editor.formato);
  editor.atual = 0;
  const formato = FORMATOS[editor.formato];
  telaArte.width = formato.largura;
  telaArte.height = formato.altura;
  telaArte.dataset.formato = editor.formato;
  $("#criador-titulo").textContent = formato.titulo;
  $("#criador-ajuda").textContent = formato.ajuda;
  $("#arquivo-midia").accept = formato.aceitaVideo ? "image/*,video/*" : "image/*";
  $("#subir-titulo").textContent = formato.aceitaVideo ? "Escolher foto ou vídeo" : "Escolher foto";
  $("#ia-desligada").hidden = config.geraImagem;
  $("#botao-gerar-ia").hidden = !config.geraImagem;
  $("#guias-opcao").hidden = !AREAS_COBERTAS[editor.formato];
  mostrarNota("");

  // Começa com as fotos guardadas do dono: a sugerida primeiro e depois as outras.
  const ids = await desenharMiniaturas();
  const ordem = ids.includes(item.foto_sugerida) ? [item.foto_sugerida, ...ids.filter((id) => id !== item.foto_sugerida)] : ids;
  for (const [i, quadro] of editor.quadros.entries()) {
    const id = ordem[i % (ordem.length || 1)];
    const imagem = id ? await fotoGuardada(id) : null;
    if (imagem) quadro.midia = { tipo: "imagem", fonte: imagem, origem: "banco", fotoId: id };
  }
  document.querySelector(`input[name=fonte][value=${ordem.length ? "banco" : "subir"}]`).checked = true;

  $("#criador").showModal();
  atualizarControles();
  desenharPrevia();
  lacoDaPrevia();
}

document.querySelectorAll("input[name=fonte]").forEach((opcao) =>
  opcao.addEventListener("change", () => mostrarFonte(opcao.value)),
);
$("#botao-gerar-ia").addEventListener("click", gerarComIa);
$("#botao-copiar-prompt").addEventListener("click", (e) => copiar(editor.item.prompt_imagem || "", e.currentTarget));
$("#arquivo-midia").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files[0];
  evento.target.value = "";
  if (!arquivo) return;
  mostrarNota("");
  try {
    await usarArquivo(arquivo);
  } catch (erro) {
    mostrarNota(erro.message, "erro");
  }
});

$("#texto-arte").addEventListener("input", (e) => {
  quadroAtual().texto = e.target.value;
  desenharPrevia();
});
document.querySelectorAll("input[name=pos-texto]").forEach((opcao) =>
  opcao.addEventListener("change", () => {
    quadroAtual().posTexto = opcao.value;
    desenharPrevia();
  }),
);
$("#mostrar-guias").addEventListener("change", desenharPrevia);

$("#zoom").addEventListener("input", (e) => {
  quadroAtual().zoom = Number(e.target.value);
  desenharPrevia();
});
$("#ajuste-preencher").addEventListener("click", () => {
  Object.assign(quadroAtual(), { zoom: 1, dx: 0, dy: 0 });
  atualizarControles();
  desenharPrevia();
});
$("#ajuste-inteira").addEventListener("click", () => {
  const quadro = quadroAtual();
  const { w, h } = tamanhoDaFonte(quadro.midia);
  const L = telaArte.width;
  const A = telaArte.height;
  Object.assign(quadro, { zoom: Math.min(L / w, A / h) / Math.max(L / w, A / h), dx: 0, dy: 0 });
  atualizarControles();
  desenharPrevia();
});
$("#video-tocar").addEventListener("click", () => {
  const video = quadroAtual().midia?.fonte;
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
  atualizarControles();
});

$("#quadro-anterior").addEventListener("click", () => irParaQuadro(editor.atual - 1));
$("#quadro-proximo").addEventListener("click", () => irParaQuadro(editor.atual + 1));
$("#quadro-adicionar").addEventListener("click", () => {
  editor.quadros.splice(editor.atual + 1, 0, novoQuadro(""));
  irParaQuadro(editor.atual + 1);
});
$("#quadro-remover").addEventListener("click", () => {
  if (editor.quadros.length <= 1) return;
  const [removido] = editor.quadros.splice(editor.atual, 1);
  pararVideoDoQuadro(removido);
  editor.atual = Math.min(editor.atual, editor.quadros.length - 1);
  irParaQuadro(editor.atual);
});

// Arrastar para mover e pinçar (ou rodinha do mouse) para aumentar.
const ponteiros = new Map();
let distanciaInicial = 0;
let zoomInicial = 1;
function escalaDaTela() {
  return telaArte.width / telaArte.getBoundingClientRect().width;
}
telaArte.addEventListener("pointerdown", (e) => {
  if (!quadroAtual()?.midia) return;
  telaArte.setPointerCapture(e.pointerId);
  ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()];
    distanciaInicial = Math.hypot(a.x - b.x, a.y - b.y);
    zoomInicial = quadroAtual().zoom;
  }
});
telaArte.addEventListener("pointermove", (e) => {
  const anterior = ponteiros.get(e.pointerId);
  if (!anterior) return;
  const quadro = quadroAtual();
  ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()];
    quadro.zoom = Math.min(3, Math.max(0.3, (zoomInicial * Math.hypot(a.x - b.x, a.y - b.y)) / (distanciaInicial || 1)));
    $("#zoom").value = String(quadro.zoom);
  } else {
    const escala = escalaDaTela();
    quadro.dx += (e.clientX - anterior.x) * escala;
    quadro.dy += (e.clientY - anterior.y) * escala;
  }
  desenharPrevia();
});
["pointerup", "pointercancel"].forEach((nome) => telaArte.addEventListener(nome, (e) => ponteiros.delete(e.pointerId)));
telaArte.addEventListener(
  "wheel",
  (e) => {
    const quadro = quadroAtual();
    if (!quadro?.midia) return;
    e.preventDefault();
    quadro.zoom = Math.min(3, Math.max(0.3, quadro.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    $("#zoom").value = String(quadro.zoom);
    desenharPrevia();
  },
  { passive: false },
);

$("#criador-fechar").addEventListener("click", () => $("#criador").close());
$("#criador").addEventListener("close", () => {
  editor.quadros.forEach(pararVideoDoQuadro);
  cancelAnimationFrame(editor.animacao);
});

// ---------- Exportar ----------

function tipoDeVideo() {
  if (typeof MediaRecorder === "undefined") return null;
  const opcoes = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  return opcoes.find((tipo) => MediaRecorder.isTypeSupported(tipo)) || null;
}

function nomeBase() {
  const titulo = editor.item.titulo || editor.item.tema || "arte";
  return titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "arte";
}

function mostrarProgresso(texto) {
  $("#carregando-exportar").hidden = !texto;
  $("#texto-exportar").textContent = texto || "";
}

function imagemDoQuadro(quadro) {
  const formato = FORMATOS[editor.formato];
  const tela = document.createElement("canvas");
  tela.width = formato.largura;
  tela.height = formato.altura;
  desenharQuadro(tela.getContext("2d"), quadro, { L: tela.width, A: tela.height });
  return new Promise((resolve) => tela.toBlob(resolve, "image/jpeg", 0.92));
}

// Grava o quadro como vídeo, em tempo real, com o som do vídeo original.
async function videoDoQuadro(quadro, rotulo) {
  const formato = FORMATOS[editor.formato];
  const mime = tipoDeVideo();
  if (!mime) throw new Error("Este navegador não consegue gravar vídeo. Use o Chrome ou o Safari atualizados.");
  const tela = document.createElement("canvas");
  tela.width = formato.largura;
  tela.height = formato.altura;
  const contexto = tela.getContext("2d");
  const fluxo = tela.captureStream(30);

  let video = null;
  let audio = null;
  let duracao = formato.segundosDaFoto || 7;
  let quadroGravado = quadro;
  if (quadro.midia.tipo === "video") {
    video = await criarVideo(quadro.midia.url, { mudo: false });
    duracao = Math.min(video.duration || duracao, formato.maxSegundos);
    try {
      audio = new AudioContext();
      const destino = audio.createMediaStreamDestination();
      audio.createMediaElementSource(video).connect(destino);
      destino.stream.getAudioTracks().forEach((faixa) => fluxo.addTrack(faixa));
      await audio.resume();
    } catch {
      video.muted = true;
    }
    quadroGravado = { ...quadro, midia: { ...quadro.midia, fonte: video } };
  }

  const pedacos = [];
  const gravador = new MediaRecorder(fluxo, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  gravador.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
  const parou = new Promise((resolve) => (gravador.onstop = resolve));

  desenharQuadro(contexto, quadroGravado, { L: tela.width, A: tela.height });
  gravador.start(1000);
  if (video) {
    video.currentTime = 0;
    await video.play();
  }
  const inicio = performance.now();
  await new Promise((resolve) => {
    const passo = () => {
      const segundos = video ? video.currentTime : (performance.now() - inicio) / 1000;
      // Foto vira vídeo com uma aproximação lenta, para não ficar parado.
      const zoomExtra = video ? 1 : 1 + 0.08 * Math.min(1, segundos / duracao);
      desenharQuadro(contexto, quadroGravado, { L: tela.width, A: tela.height, zoomExtra });
      mostrarProgresso(`${rotulo}: gravando ${Math.min(Math.round(segundos), Math.round(duracao))} de ${Math.round(duracao)} segundos. Deixe esta tela aberta.`);
      if (segundos >= duracao || video?.ended) resolve();
      else setTimeout(passo, 1000 / 30);
    };
    passo();
  });
  video?.pause();
  gravador.stop();
  await parou;
  fluxo.getTracks().forEach((faixa) => faixa.stop());
  audio?.close();
  const extensao = mime.startsWith("video/mp4") ? "mp4" : "webm";
  if (extensao === "webm") {
    mostrarNota("Este navegador salvou o vídeo em WebM, que o Instagram pode recusar. No Chrome ou Safari atualizados, ele sai em MP4.", "atencao");
  }
  return { blob: new Blob(pedacos, { type: mime.split(";")[0] }), extensao };
}

async function arquivoDoQuadro(indice) {
  const quadro = editor.quadros[indice];
  const formato = FORMATOS[editor.formato];
  if (!quadro.midia) {
    throw new Error(`Escolha uma foto${formato.aceitaVideo ? " ou vídeo" : ""} para ${formato.nomeQuadro.toLowerCase()} ${indice + 1}.`);
  }
  const sufixo = editor.quadros.length > 1 ? `-${formato.nomeQuadro.toLowerCase()}-${indice + 1}` : "";
  if (editor.formato === "reels" || quadro.midia.tipo === "video") {
    const rotulo = editor.quadros.length > 1 ? `${formato.nomeQuadro} ${indice + 1}` : "Vídeo";
    const { blob, extensao } = await videoDoQuadro(quadro, rotulo);
    return new File([blob], `${nomeBase()}${sufixo}.${extensao}`, { type: blob.type });
  }
  return new File([await imagemDoQuadro(quadro)], `${nomeBase()}${sufixo}.jpg`, { type: "image/jpeg" });
}

function baixar(arquivo) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(arquivo);
  link.download = arquivo.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

// ZIP simples (sem compressão), para baixar todos os slides de uma vez.
const tabelaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = tabelaCrc[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function criarZip(arquivos) {
  const partes = [];
  const central = [];
  let posicao = 0;
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  for (const arquivo of arquivos) {
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    const nome = new TextEncoder().encode(arquivo.name);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    const entrada = new DataView(new ArrayBuffer(46));
    entrada.setUint32(0, 0x02014b50, true);
    entrada.setUint16(4, 20, true);
    entrada.setUint16(6, 20, true);
    entrada.setUint16(8, 0x0800, true);
    entrada.setUint16(12, hora, true);
    entrada.setUint16(14, dia, true);
    entrada.setUint32(16, crc, true);
    entrada.setUint32(20, dados.length, true);
    entrada.setUint32(24, dados.length, true);
    entrada.setUint16(28, nome.length, true);
    entrada.setUint32(42, posicao, true);
    partes.push(local, nome, dados);
    central.push(entrada, nome);
    posicao += 30 + nome.length + dados.length;
  }
  const tamanhoCentral = central.reduce((soma, parte) => soma + parte.byteLength, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);
  return new File([...partes, ...central, fim], `${nomeBase()}.zip`, { type: "application/zip" });
}

function podeCompartilhar() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([""], "a.jpg", { type: "image/jpeg" })] }));
  } catch {
    return false;
  }
}

async function exportar(acao) {
  if (editor.exportando) return;
  editor.exportando = true;
  pararVideoDoQuadro(quadroAtual());
  const botoes = document.querySelectorAll("#criador .botoes .botao");
  botoes.forEach((b) => (b.disabled = true));
  mostrarNota("");
  try {
    await acao();
  } catch (erro) {
    if (erro.name !== "AbortError") mostrarNota(erro.message, "erro");
  } finally {
    editor.exportando = false;
    mostrarProgresso("");
    botoes.forEach((b) => (b.disabled = false));
    if (quadroAtual()?.midia?.tipo === "video") quadroAtual().midia.fonte.play().catch(() => {});
    atualizarControles();
  }
}

async function todosOsArquivos() {
  const arquivos = [];
  for (let i = 0; i < editor.quadros.length; i++) {
    mostrarProgresso(`Preparando ${FORMATOS[editor.formato].nomeQuadro.toLowerCase()} ${i + 1} de ${editor.quadros.length}…`);
    arquivos.push(await arquivoDoQuadro(i));
  }
  return arquivos;
}

$("#botao-baixar").addEventListener("click", () =>
  exportar(async () => {
    baixar(await arquivoDoQuadro(editor.atual));
    mostrarNota(editor.formato === "story" ? "Pronto. Poste cada tela em sequência no story." : "Pronto. Abra o Instagram, escolha o arquivo e cole a legenda.");
  }),
);
$("#botao-baixar-todos").addEventListener("click", () =>
  exportar(async () => {
    baixar(await criarZip(await todosOsArquivos()));
    mostrarNota(
      editor.formato === "carrossel"
        ? "Pronto. No Instagram, toque em “Selecionar vários” e escolha os slides na ordem."
        : "Pronto. Poste as telas em sequência no story.",
    );
  }),
);
$("#botao-capa").addEventListener("click", () =>
  exportar(async () => {
    const quadro = quadroAtual();
    if (!quadro.midia) throw new Error("Escolha uma foto ou vídeo primeiro.");
    baixar(new File([await imagemDoQuadro(quadro)], `${nomeBase()}-capa.jpg`, { type: "image/jpeg" }));
    mostrarNota("Capa baixada. No Instagram, ao postar o Reels, toque em “Editar capa” e escolha esta imagem.");
  }),
);
// O celular só abre a janela de compartilhar logo depois do toque. Se o vídeo
// demorar para ficar pronto, o arquivo fica guardado e o dono toca de novo.
let prontosParaEnviar = null;
$("#botao-compartilhar").addEventListener("click", () =>
  exportar(async () => {
    const arquivos =
      prontosParaEnviar ?? (editor.formato === "carrossel" ? await todosOsArquivos() : [await arquivoDoQuadro(editor.atual)]);
    prontosParaEnviar = null;
    try {
      await navigator.share({ files: arquivos });
    } catch (erro) {
      if (erro.name !== "NotAllowedError") throw erro;
      prontosParaEnviar = arquivos;
      mostrarNota("O arquivo está pronto. Toque de novo em “Enviar para o Instagram”.", "atencao");
    }
  }),
);
