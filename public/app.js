// Tudo o que o dono preenche e gera fica salvo neste aparelho: os textos no
// localStorage e as fotos no IndexedDB (que aguenta arquivos maiores).
// Cada conta tem os seus dados separados, mesmo no mesmo aparelho.
const CHAVES = {
  perfil: "perfil",
  semana: "semana",
  feitos: "postsFeitos",
  ideias: "ideias",
  dicas: "dicas",
  dicasFeitas: "dicasFeitas",
};

let usuario = null;
const prefixo = () => (usuario ? `u:${usuario.id}:` : "sem-conta:");

const VERSAO_AUTORIZACAO = 1;
const MAX_FOTOS_POR_ENVIO = 8;
const MAX_FOTOS_GUARDADAS = 40;
const MAX_CARDAPIO_BYTES = 8 * 1024 * 1024;

function ler(chave, padrao) {
  try {
    const valor = localStorage.getItem(prefixo() + chave);
    return valor ? JSON.parse(valor) : padrao;
  } catch {
    return padrao;
  }
}

function salvar(chave, valor) {
  try {
    localStorage.setItem(prefixo() + chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento (aba anônima, por exemplo): a página segue funcionando.
  }
}

const $ = (seletor) => document.querySelector(seletor);

function el(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

let config = { pedeConvite: false, googleClientId: "", chaveConfigurada: true, geraImagem: false };

// ---------- Fotos guardadas no aparelho (IndexedDB) ----------

const fotosDb = (() => {
  let conexao;
  let nomeAberto;
  function abrir() {
    const nome = usuario ? `conteudo-instagram-${usuario.id}` : "conteudo-instagram";
    if (nome !== nomeAberto) {
      conexao?.then((db) => db.close()).catch(() => {});
      conexao = null;
      nomeAberto = nome;
    }
    conexao ??= new Promise((resolve, reject) => {
      const pedido = indexedDB.open(nome, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore("fotos", { keyPath: "id" });
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
    return conexao;
  }
  async function operar(modo, acao) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const transacao = db.transaction("fotos", modo);
      const pedido = acao(transacao.objectStore("fotos"));
      transacao.oncomplete = () => resolve(pedido?.result);
      transacao.onerror = () => reject(transacao.error);
    });
  }
  return {
    guardar: (foto) => operar("readwrite", (loja) => loja.put(foto)).catch(() => null),
    pegar: (id) => operar("readonly", (loja) => loja.get(id)).catch(() => null),
    apagar: (id) => operar("readwrite", (loja) => loja.delete(id)).catch(() => null),
    apagarTodas: () => operar("readwrite", (loja) => loja.clear()).catch(() => null),
  };
})();

// ---------- Avisos ----------

function mostrarAviso(mensagem, tipo = "erro") {
  const aviso = $("#aviso");
  aviso.textContent = mensagem;
  aviso.className = `aviso ${tipo}`;
  aviso.hidden = false;
  aviso.scrollIntoView({ behavior: "smooth", block: "center" });
}

function esconderAviso() {
  $("#aviso").hidden = true;
}

// ---------- Chamadas ao servidor ----------

async function pedir(caminho, corpo, idCarregando, botao) {
  esconderAviso();
  const carregando = idCarregando ? $(idCarregando) : null;
  if (carregando) carregando.hidden = false;
  if (botao) botao.disabled = true;
  try {
    const resposta = await fetch(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfil: ler(CHAVES.perfil, null), ...corpo }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (dados.pedeLogin) mostrarLogin();
      throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
    }
    return dados;
  } catch (erro) {
    const mensagem =
      erro instanceof TypeError
        ? "Não consegui falar com o servidor. Confira se a janela onde você rodou “npm start” continua aberta e se o endereço no navegador é http://localhost:3000."
        : erro.message;
    mostrarAviso(mensagem);
    return null;
  } finally {
    if (carregando) carregando.hidden = true;
    if (botao) botao.disabled = false;
  }
}

// ---------- Arquivos: reduzir fotos e ler PDF ----------

function novoId() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function reduzirImagem(arquivo, ladoMaximo, qualidade = 0.85) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", qualidade);
}

function base64DeDataUrl(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function lerComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

async function prepararCardapio(arquivo) {
  if (arquivo.type === "application/pdf") {
    if (arquivo.size > MAX_CARDAPIO_BYTES) throw new Error("O PDF do cardápio passa de 8 MB. Tente um arquivo menor ou uma foto.");
    return { tipo: "application/pdf", dados: base64DeDataUrl(await lerComoDataUrl(arquivo)) };
  }
  if (!arquivo.type.startsWith("image/")) throw new Error("O cardápio precisa ser uma foto ou um PDF.");
  return { tipo: "image/jpeg", dados: base64DeDataUrl(await reduzirImagem(arquivo, 2000, 0.9)) };
}

async function prepararFotos(arquivos) {
  const fotos = [];
  for (const arquivo of arquivos) {
    if (!arquivo.type.startsWith("image/")) continue;
    try {
      fotos.push({ id: novoId(), dataUrl: await reduzirImagem(arquivo, 1280) });
    } catch {
      // Formato que o navegador não abre (alguns HEIC, por exemplo): ignora essa foto.
    }
  }
  return fotos;
}

// ---------- Cadastro: passo 1 ----------

const formInicio = $("#form-inicio");
const formPerfil = $("#form-perfil");
let cardapioEscolhido = null;
let fotosNovas = []; // { id, dataUrl } ainda não analisadas

function miniatura(src, aoRemover) {
  const caixa = el("div", "miniatura");
  const imagem = el("img");
  imagem.src = src;
  imagem.alt = "";
  caixa.append(imagem);
  if (aoRemover) {
    const remover = el("button", "remover", "×");
    remover.type = "button";
    remover.setAttribute("aria-label", "Remover foto");
    remover.addEventListener("click", aoRemover);
    caixa.append(remover);
  }
  return caixa;
}

function desenharMiniaturasCadastro() {
  const destino = $("#miniaturas-cadastro");
  destino.replaceChildren(
    ...fotosNovas.map((foto) =>
      miniatura(foto.dataUrl, () => {
        fotosNovas = fotosNovas.filter((f) => f.id !== foto.id);
        desenharMiniaturasCadastro();
      }),
    ),
  );
}

$("#tipo").addEventListener("change", (evento) => {
  $("#campo-tipo-outro").hidden = evento.target.value !== "Outro";
});

$("#arquivo-cardapio").addEventListener("change", (evento) => {
  cardapioEscolhido = evento.target.files[0] || null;
  $("#cardapio-nome").textContent = cardapioEscolhido
    ? `Cardápio escolhido: ${cardapioEscolhido.name}`
    : "Enviar foto ou PDF do cardápio";
});

$("#arquivo-fotos").addEventListener("change", async (evento) => {
  const escolhidas = [...evento.target.files];
  evento.target.value = "";
  const novas = await prepararFotos(escolhidas);
  fotosNovas = [...fotosNovas, ...novas].slice(0, MAX_FOTOS_POR_ENVIO);
  if (fotosNovas.length < novas.length || escolhidas.length > MAX_FOTOS_POR_ENVIO) {
    mostrarAviso(`Por enquanto dá para mandar ${MAX_FOTOS_POR_ENVIO} fotos. Depois você adiciona mais em “Meu negócio”.`, "atencao");
  }
  desenharMiniaturasCadastro();
});

function dadosDoInicio() {
  const dados = Object.fromEntries(new FormData(formInicio).entries());
  delete dados.autorizo;
  dados.instagram = dados.instagram?.trim();
  if (dados.instagram && !dados.instagram.startsWith("@") && !dados.instagram.includes("instagram.com")) {
    dados.instagram = `@${dados.instagram}`;
  }
  return dados;
}

function autorizacao() {
  return { aceita: true, data: new Date().toISOString(), versao: VERSAO_AUTORIZACAO };
}

async function guardarFotos(fotos, descricoes = []) {
  const perfil = ler(CHAVES.perfil, {});
  const lista = perfil.fotos || [];
  for (const foto of fotos) {
    await fotosDb.guardar({ id: foto.id, dataUrl: foto.dataUrl });
    const descricao = descricoes.find((d) => d.id === foto.id)?.descricao || "Foto do negócio";
    lista.push({ id: foto.id, descricao });
  }
  perfil.fotos = lista.slice(-MAX_FOTOS_GUARDADAS);
  salvar(CHAVES.perfil, perfil);
}

formInicio.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const anterior = ler(CHAVES.perfil, {});
  const base = { ...anterior, ...dadosDoInicio(), autorizacao: autorizacao() };
  salvar(CHAVES.perfil, base);

  let cardapio;
  try {
    cardapio = cardapioEscolhido ? await prepararCardapio(cardapioEscolhido) : undefined;
  } catch (erro) {
    mostrarAviso(erro.message);
    return;
  }
  const fotos = fotosNovas.map((f) => ({ id: f.id, dados: base64DeDataUrl(f.dataUrl) }));
  const analise = await pedir(
    "/api/analisar",
    { cardapio, fotos, autorizado: true },
    "#carregando-analise",
    $("#botao-analisar"),
  );
  if (!analise) return;

  await guardarFotos(fotosNovas, analise.fotos);
  fotosNovas = [];
  desenharMiniaturasCadastro();

  const perfil = ler(CHAVES.perfil, {});
  perfil.analise = {
    resumo: analise.resumo,
    pontos_fortes: analise.pontos_fortes,
    oportunidades: analise.oportunidades,
    leituras: analise.leituras,
    data: new Date().toISOString(),
  };
  // Preenche só o que o dono ainda não escreveu. A exceção é a lista de
  // produtos quando ele manda um cardápio novo: aí vale o cardápio.
  for (const campo of ["produtos", "publico", "diferenciais", "tom"]) {
    const novoCardapio = campo === "produtos" && cardapio;
    if (analise[campo] && (!perfil[campo] || novoCardapio)) perfil[campo] = analise[campo];
  }
  salvar(CHAVES.perfil, perfil);
  mostrarConferir();
});

$("#botao-pular").addEventListener("click", () => {
  if (!formInicio.reportValidity()) return;
  salvar(CHAVES.perfil, { ...ler(CHAVES.perfil, {}), ...dadosDoInicio(), autorizacao: autorizacao() });
  // As fotos escolhidas são guardadas sem descrição; dá para usar nas artes mesmo assim.
  guardarFotos(fotosNovas).then(() => {
    fotosNovas = [];
    desenharMiniaturasCadastro();
    mostrarConferir();
  });
});

// ---------- Cadastro: passo 2 ----------

function desenharAnalise(destino, analise) {
  destino.replaceChildren();
  if (!analise) return;
  const caixa = el("div", "caixa destaque");
  caixa.append(el("h2", "", "O que encontramos"));
  caixa.append(el("p", "", analise.resumo));
  if (analise.pontos_fortes?.length) {
    caixa.append(el("h4", "", "Pontos fortes"));
    const lista = el("ul", "lista-simples");
    analise.pontos_fortes.forEach((p) => lista.append(el("li", "", p)));
    caixa.append(lista);
  }
  if (analise.oportunidades?.length) {
    caixa.append(el("h4", "", "O que dá para melhorar no Instagram"));
    const lista = el("ul", "lista-simples");
    analise.oportunidades.forEach((p) => lista.append(el("li", "", p)));
    caixa.append(lista);
  }
  const perfil = ler(CHAVES.perfil, {});
  const avisos = [];
  if (perfil.site && analise.leituras && !analise.leituras.site) avisos.push("Não consegui abrir o seu site.");
  if (perfil.instagram && analise.leituras && !analise.leituras.instagram) {
    avisos.push("O Instagram mostra pouca coisa para quem não está logado, então usei só o que você enviou.");
  }
  if (avisos.length) caixa.append(el("p", "nota", avisos.join(" ")));
  destino.append(caixa);
}

function preencher(form, perfil) {
  for (const [campo, valor] of Object.entries(perfil)) {
    // Funciona para campos comuns e para o grupo de opções do tom de voz.
    const entrada = form.elements[campo];
    if (entrada && typeof valor !== "object") entrada.value = valor;
  }
}

function mostrarConferir() {
  const perfil = ler(CHAVES.perfil, {});
  desenharAnalise($("#resultado-analise"), perfil.analise);
  preencher(formPerfil, perfil);
  mostrarTela("conferir");
}

formPerfil.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const perfil = { ...ler(CHAVES.perfil, {}), ...Object.fromEntries(new FormData(formPerfil).entries()) };
  salvar(CHAVES.perfil, perfil);
  mostrarPainel();
});

$("#botao-voltar").addEventListener("click", () => mostrarCadastro());

// ---------- Telas e abas ----------

function mostrarTela(nome) {
  $("#tela-login").hidden = nome !== "login";
  $("#tela-cadastro").hidden = nome !== "cadastro";
  $("#tela-conferir").hidden = nome !== "conferir";
  $("#tela-painel").hidden = nome !== "painel";
  window.scrollTo({ top: 0 });
}

function mostrarCadastro() {
  const perfil = ler(CHAVES.perfil, {});
  preencher(formInicio, perfil);
  $("#autorizo").checked = Boolean(perfil.autorizacao?.aceita);
  $("#campo-tipo-outro").hidden = perfil.tipo !== "Outro";
  $("#nome-negocio").textContent = "";
  mostrarTela("cadastro");
}

function mostrarPainel() {
  const perfil = ler(CHAVES.perfil, {});
  $("#nome-negocio").textContent = perfil.nome || "";
  mostrarTela("painel");
  desenharSemana();
  desenharIdeias();
  desenharDicas();
  desenharNegocio();
}

function abrirAba(nome) {
  document.querySelectorAll(".aba[data-aba]").forEach((aba) => {
    aba.setAttribute("aria-selected", String(aba.dataset.aba === nome));
  });
  document.querySelectorAll(".painel").forEach((painel) => {
    painel.hidden = painel.dataset.painel !== nome;
  });
  esconderAviso();
}

document.querySelectorAll(".aba[data-aba]").forEach((aba) => {
  aba.addEventListener("click", () => abrirAba(aba.dataset.aba));
});

// ---------- Copiar ----------

async function copiar(texto, botao) {
  const original = botao.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = "Copiado!";
  } catch {
    // Alguns navegadores bloqueiam a cópia: mostra o texto selecionado para copiar à mão.
    const area = el("textarea", "copia-manual");
    area.value = texto;
    botao.after(area);
    area.select();
    botao.textContent = "Selecione e copie o texto abaixo";
  }
  setTimeout(() => (botao.textContent = original), 2500);
}

function textoParaCopiar(item) {
  const hashtags = (item.hashtags || []).join(" ");
  return hashtags ? `${item.legenda}\n\n${hashtags}` : item.legenda;
}

// ---------- Cartões ----------

function marcarFeito(cartao, chave, rotulo = "Já postei") {
  const linha = el("label", "feito");
  const caixa = document.createElement("input");
  caixa.type = "checkbox";
  caixa.checked = Boolean(ler(CHAVES.feitos, {})[chave]);
  cartao.classList.toggle("concluido", caixa.checked);
  caixa.addEventListener("change", () => {
    const atuais = ler(CHAVES.feitos, {});
    if (caixa.checked) atuais[chave] = true;
    else delete atuais[chave];
    salvar(CHAVES.feitos, atuais);
    cartao.classList.toggle("concluido", caixa.checked);
    atualizarProgresso();
  });
  linha.append(caixa, rotulo);
  return linha;
}

function botao(texto, classe, aoClicar) {
  const b = el("button", `botao pequeno ${classe}`, texto);
  b.type = "button";
  b.addEventListener("click", aoClicar);
  return b;
}

function cartaoFeed(item, { quando, chaveFeito, aoTrocar }) {
  const cartao = el("article", "post");
  const topo = el("div", "post-topo");
  const cabeca = el("div");
  if (quando) cabeca.append(el("p", "post-hora", quando));
  cabeca.append(el("h3", "post-titulo", item.titulo));
  topo.append(cabeca);
  const selo = el("span", "selo", item.formato);
  selo.dataset.formato = item.formato;
  topo.append(selo);
  cartao.append(topo);
  if (item.objetivo) cartao.append(el("p", "post-objetivo", `Objetivo: ${item.objetivo}`));
  cartao.append(el("p", "", item.ideia));

  const detalhes = el("details");
  detalhes.append(el("summary", "", "Ver legenda e como gravar"));
  const corpo = el("div", "post-detalhes");
  corpo.append(el("h4", "", "Como gravar ou fotografar"));
  const roteiro = el("ol", "post-roteiro");
  (item.roteiro || []).forEach((passo) => roteiro.append(el("li", "", passo)));
  corpo.append(roteiro);
  if (item.slides?.length) {
    corpo.append(el("h4", "", "Texto de cada slide"));
    const slides = el("ol", "post-roteiro");
    item.slides.forEach((slide) => slides.append(el("li", "", slide)));
    corpo.append(slides);
  }
  corpo.append(el("h4", "", "Legenda pronta"));
  corpo.append(el("p", "post-legenda", item.legenda));
  corpo.append(el("p", "post-hashtags", (item.hashtags || []).join(" ")));
  const botaoCopiar = botao("Copiar legenda com hashtags", "secundario", () => copiar(textoParaCopiar(item), botaoCopiar));
  corpo.append(botaoCopiar);
  detalhes.append(corpo);
  cartao.append(detalhes);

  const acoes = el("div", "acoes");
  acoes.append(botao("Criar com IA", "", () => abrirCriador(item, "feed")));
  if (aoTrocar) acoes.append(botao("Nova ideia", "dourado", (e) => aoTrocar(e.currentTarget)));
  cartao.append(acoes);
  if (chaveFeito) cartao.append(marcarFeito(cartao, chaveFeito));
  return cartao;
}

function cartaoStory(item, { chaveFeito, aoTrocar }) {
  const cartao = el("article", "post story");
  const topo = el("div", "post-topo");
  topo.append(el("h3", "post-titulo", item.tema));
  const selo = el("span", "selo", "Story");
  selo.dataset.formato = "Story";
  topo.append(selo);
  cartao.append(topo);
  cartao.append(el("p", "post-objetivo", `${item.telas?.length || 0} telas em sequência`));

  const detalhes = el("details");
  detalhes.append(el("summary", "", "Ver o que postar em cada tela"));
  const corpo = el("div", "post-detalhes");
  const telas = el("ol", "post-roteiro");
  (item.telas || []).forEach((tela) => {
    const li = el("li", "tela-story", tela.mostrar);
    if (tela.texto_na_tela) li.append(el("span", "", `Texto na tela: ${tela.texto_na_tela}`));
    if (tela.interacao) li.append(el("span", "", `Figurinha: ${tela.interacao}`));
    telas.append(li);
  });
  corpo.append(telas);
  detalhes.append(corpo);
  cartao.append(detalhes);

  const acoes = el("div", "acoes");
  acoes.append(botao("Criar com IA", "", () => abrirCriador(item, "story")));
  if (aoTrocar) acoes.append(botao("Nova ideia", "dourado", (e) => aoTrocar(e.currentTarget)));
  cartao.append(acoes);
  if (chaveFeito) cartao.append(marcarFeito(cartao, chaveFeito));
  return cartao;
}

// ---------- Semana ----------

function dataLocal(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function formatarData(texto, opcoes = { day: "numeric", month: "short" }) {
  const [ano, mes, dia] = texto.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", opcoes);
}

function preencherSemanas() {
  const hoje = new Date();
  const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7));
  const seletor = $("#semana");
  ["Esta semana", "Próxima semana", "Daqui a 2 semanas"].forEach((nome, i) => {
    const inicio = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + i * 7);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
    const curto = { day: "numeric", month: "numeric" };
    const rotulo = `${nome} (${inicio.toLocaleDateString("pt-BR", curto)} a ${fim.toLocaleDateString("pt-BR", curto)})`;
    seletor.append(new Option(rotulo, dataLocal(inicio)));
  });
  // Do meio da semana em diante, a próxima semana é a escolha mais útil.
  if ((hoje.getDay() + 6) % 7 >= 3) seletor.selectedIndex = 1;
}

function chaveDo(semana, tipo, data) {
  return `${semana.segunda}:${tipo}:${data}`;
}

function atualizarProgresso() {
  const semana = ler(CHAVES.semana, null);
  const alvo = $("#progresso");
  if (!semana || !alvo) return;
  const feitos = ler(CHAVES.feitos, {});
  const chaves = [
    ...semana.stories.map((s) => chaveDo(semana, "story", s.data)),
    ...semana.feed.map((p) => chaveDo(semana, "feed", p.data)),
  ];
  const prontos = chaves.filter((c) => feitos[c]).length;
  alvo.querySelector(".progresso-texto").textContent = `${prontos} de ${chaves.length} publicações feitas`;
  alvo.querySelector(".progresso-barra span").style.width = `${chaves.length ? (prontos / chaves.length) * 100 : 0}%`;
}

function titulosDaSemana(semana) {
  return [...semana.stories.map((s) => s.tema), ...semana.feed.map((p) => p.titulo)];
}

async function trocar(tipo, indice, botaoClicado) {
  const semana = ler(CHAVES.semana, null);
  const lista = tipo === "story" ? semana.stories : semana.feed;
  const atual = lista[indice];
  botaoClicado.textContent = "Pensando…";
  const novo = await pedir(
    "/api/trocar",
    { tipo, item: atual, outrosTitulos: titulosDaSemana(semana) },
    null,
    botaoClicado,
  );
  botaoClicado.textContent = "Nova ideia";
  if (!novo) return;
  lista[indice] = novo;
  salvar(CHAVES.semana, semana);
  desenharSemana();
}

function desenharSemana() {
  const destino = $("#resultado-semana");
  destino.replaceChildren();
  const semana = ler(CHAVES.semana, null);
  if (!semana) {
    destino.append(el("p", "vazio", "Você ainda não tem um calendário. Escolha a semana acima e toque em “Criar calendário da semana”."));
    return;
  }

  const inicio = formatarData(semana.segunda, { day: "numeric", month: "long" });
  const cabecalho = el("div", "caixa");
  cabecalho.append(el("span", "etiqueta", `Semana de ${inicio}`));
  cabecalho.append(el("p", "", semana.estrategia));
  const progresso = el("div", "progresso");
  progresso.id = "progresso";
  progresso.append(el("span", "progresso-texto"));
  const barra = el("div", "progresso-barra");
  barra.append(el("span"));
  progresso.append(barra);
  cabecalho.append(progresso);
  destino.append(cabecalho);

  semana.stories.forEach((story, i) => {
    const dia = el("div", "dia");
    const topo = el("div", "dia-topo");
    const nomeDia = story.diaDaSemana.charAt(0).toUpperCase() + story.diaDaSemana.slice(1);
    topo.append(el("h3", "", nomeDia), el("span", "rotulo-dia", formatarData(story.data)));
    dia.append(topo);
    const lista = el("div", "lista");
    lista.append(
      cartaoStory(story, {
        chaveFeito: chaveDo(semana, "story", story.data),
        aoTrocar: (b) => trocar("story", i, b),
      }),
    );
    semana.feed.forEach((post, j) => {
      if (post.data !== story.data) return;
      lista.append(
        cartaoFeed(post, {
          quando: `Feed às ${post.horario}`,
          chaveFeito: chaveDo(semana, "feed", post.data),
          aoTrocar: (b) => trocar("feed", j, b),
        }),
      );
    });
    dia.append(lista);
    destino.append(dia);
  });
  atualizarProgresso();
}

$("#botao-semana").addEventListener("click", async (evento) => {
  const segunda = $("#semana").value;
  const resultado = await pedir("/api/semana", { segunda }, "#carregando-semana", evento.currentTarget);
  if (!resultado) return;
  salvar(CHAVES.semana, resultado);
  desenharSemana();
  $("#resultado-semana").scrollIntoView({ behavior: "smooth" });
});

// ---------- Ideias ----------

function desenharIdeias() {
  const destino = $("#resultado-ideias");
  destino.replaceChildren();
  const ideias = ler(CHAVES.ideias, []);
  if (!ideias.length) return;
  destino.append(el("h4", "", "Suas ideias"));
  const lista = el("div", "lista");
  ideias.forEach((ideia) => lista.append(cartaoFeed(ideia, { quando: ideia.quando_postar })));
  destino.append(lista);
}

$("#botao-ideias").addEventListener("click", async (evento) => {
  const semana = ler(CHAVES.semana, null);
  const anteriores = ler(CHAVES.ideias, []);
  const titulosExistentes = [...(semana ? titulosDaSemana(semana) : []), ...anteriores.map((i) => i.titulo)];
  const resultado = await pedir("/api/ideias", { titulosExistentes }, "#carregando-ideias", evento.currentTarget);
  if (!resultado) return;
  // As mais novas aparecem primeiro; guarda no máximo 30.
  salvar(CHAVES.ideias, [...resultado.ideias, ...anteriores].slice(0, 30));
  desenharIdeias();
});

// ---------- Dicas para crescer ----------

function desenharDicas() {
  const destino = $("#resultado-dicas");
  destino.replaceChildren();
  const dicas = ler(CHAVES.dicas, []);
  if (!dicas.length) return;
  const feitas = ler(CHAVES.dicasFeitas, {});
  const lista = el("div", "lista");
  dicas.forEach((dica) => {
    const cartao = el("article", "post");
    const topo = el("div", "post-topo");
    topo.append(el("h3", "post-titulo", dica.titulo));
    const selo = el("span", "selo", dica.esforco);
    selo.dataset.esforco = dica.esforco;
    topo.append(selo);
    cartao.append(topo);
    cartao.append(el("p", "", dica.por_que));
    const passos = el("ol", "post-roteiro");
    dica.como_fazer.forEach((passo) => passos.append(el("li", "", passo)));
    cartao.append(passos);
    const rotulo = el("label", "feito");
    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.checked = Boolean(feitas[dica.titulo]);
    cartao.classList.toggle("concluido", caixa.checked);
    caixa.addEventListener("change", () => {
      const atuais = ler(CHAVES.dicasFeitas, {});
      if (caixa.checked) atuais[dica.titulo] = true;
      else delete atuais[dica.titulo];
      salvar(CHAVES.dicasFeitas, atuais);
      cartao.classList.toggle("concluido", caixa.checked);
    });
    rotulo.append(caixa, "Já fiz");
    cartao.append(rotulo);
    lista.append(cartao);
  });
  destino.append(lista);
}

$("#botao-dicas").addEventListener("click", async (evento) => {
  const resultado = await pedir("/api/dicas", {}, "#carregando-dicas", evento.currentTarget);
  if (!resultado) return;
  salvar(CHAVES.dicas, resultado.dicas);
  desenharDicas();
});

// ---------- Meu negócio ----------

async function desenharGaleria() {
  const perfil = ler(CHAVES.perfil, {});
  const destino = $("#galeria");
  destino.replaceChildren();
  const fotos = perfil.fotos || [];
  if (!fotos.length) {
    destino.append(el("p", "nota", "Nenhuma foto ainda."));
    return;
  }
  for (const foto of fotos) {
    const guardada = await fotosDb.pegar(foto.id);
    if (!guardada) continue;
    const item = miniatura(guardada.dataUrl, async () => {
      await fotosDb.apagar(foto.id);
      const atual = ler(CHAVES.perfil, {});
      atual.fotos = (atual.fotos || []).filter((f) => f.id !== foto.id);
      salvar(CHAVES.perfil, atual);
      desenharGaleria();
    });
    item.title = foto.descricao;
    destino.append(item);
  }
}

function desenharNegocio() {
  desenharGaleria();
  const perfil = ler(CHAVES.perfil, {});
  $("#caixa-analise").hidden = !perfil.analise;
  desenharAnalise($("#analise-salva"), perfil.analise);
  const data = perfil.autorizacao?.data ? new Date(perfil.autorizacao.data).toLocaleDateString("pt-BR") : null;
  $("#texto-autorizacao").textContent = data
    ? `Você autorizou o uso dos seus dados e fotos em ${data}. Para retirar a autorização, use “Apagar tudo”.`
    : "";
}

$("#arquivo-mais-fotos").addEventListener("change", async (evento) => {
  const escolhidas = [...evento.target.files].slice(0, MAX_FOTOS_POR_ENVIO);
  evento.target.value = "";
  if (!ler(CHAVES.perfil, {}).autorizacao?.aceita) {
    mostrarAviso("Antes de mandar fotos, autorize o uso em “Editar dados do negócio”.");
    return;
  }
  const fotos = await prepararFotos(escolhidas);
  if (!fotos.length) return;
  const descritas = await pedir(
    "/api/fotos",
    { fotos: fotos.map((f) => ({ id: f.id, dados: base64DeDataUrl(f.dataUrl) })), autorizado: true },
    "#carregando-fotos",
  );
  // Mesmo se a descrição falhar, a foto fica guardada para usar nas artes.
  await guardarFotos(fotos, descritas?.fotos || []);
  desenharGaleria();
});

$("#botao-editar-perfil").addEventListener("click", mostrarCadastro);
$("#botao-apagar").addEventListener("click", () => ($("#confirmar-apagar").hidden = false));
$("#botao-apagar-nao").addEventListener("click", () => ($("#confirmar-apagar").hidden = true));
$("#botao-apagar-sim").addEventListener("click", async () => {
  try {
    for (const chave of Object.keys(localStorage)) if (chave.startsWith(prefixo())) localStorage.removeItem(chave);
  } catch {}
  await fotosDb.apagarTodas();
  formInicio.reset();
  formPerfil.reset();
  cardapioEscolhido = null;
  $("#confirmar-apagar").hidden = true;
  abrirAba("semana");
  mostrarCadastro();
});

// O editor de arte (abrirCriador) fica em editor.js.

// ---------- Conta ----------

let modoLogin = "entrar";
let credencialGoogle = null; // guardada quando a conta Google nova precisa do convite

function mudarModoLogin(modo) {
  modoLogin = modo;
  document.querySelectorAll("[data-modo]").forEach((aba) => aba.setAttribute("aria-selected", String(aba.dataset.modo === modo)));
  const criar = modo === "criar";
  $("#campo-nome-conta").hidden = !criar;
  $("#campo-convite").hidden = !(criar && config.pedeConvite) && !credencialGoogle;
  $("#ajuda-senha").hidden = !criar;
  $("#senha").autocomplete = criar ? "new-password" : "current-password";
  $("#botao-login").textContent = criar ? "Criar conta" : "Entrar";
}

document.querySelectorAll("[data-modo]").forEach((aba) => aba.addEventListener("click", () => {
  credencialGoogle = null;
  mudarModoLogin(aba.dataset.modo);
}));

function mostrarLogin() {
  usuario = null;
  $("#conta").hidden = true;
  $("#nome-negocio").textContent = "";
  $("#criador").close?.();
  mudarModoLogin(modoLogin);
  mostrarTela("login");
}

async function entrar(caminho, corpo, botao) {
  esconderAviso();
  botao.disabled = true;
  try {
    const resposta = await fetch(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (dados.pedeConvite) $("#campo-convite").hidden = false;
      throw new Error(dados.erro || "Não consegui entrar. Tente de novo.");
    }
    credencialGoogle = null;
    modoLogin = "entrar";
    $("#form-login").reset();
    abrirConta(dados.usuario);
  } catch (erro) {
    mostrarAviso(erro instanceof TypeError ? "Não consegui falar com o servidor. Confira a internet e tente de novo." : erro.message);
  } finally {
    botao.disabled = false;
  }
}

$("#form-login").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.target).entries());
  if (credencialGoogle) {
    entrar("/api/entrar-google", { credencial: credencialGoogle, convite: dados.convite }, $("#botao-login"));
  } else {
    entrar(modoLogin === "criar" ? "/api/conta" : "/api/entrar", dados, $("#botao-login"));
  }
});

// Botão oficial "Entrar com o Google" (Google Identity Services).
function prepararGoogle() {
  if (!config.googleClientId) return;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: ({ credential }) => {
        credencialGoogle = credential;
        entrar("/api/entrar-google", { credencial: credential, convite: $("#convite").value }, $("#botao-login")).then(() => {
          // Conta nova que precisa de convite: o formulário passa a enviar só o convite.
          if (credencialGoogle && !$("#campo-convite").hidden) {
            $("#campo-email").hidden = $("#campo-senha").hidden = $("#campo-nome-conta").hidden = true;
            $("#email").required = $("#senha").required = false;
            $("#botao-login").textContent = "Continuar com o Google";
          }
        });
      },
    });
    google.accounts.id.renderButton($("#botao-google"), { theme: "filled_black", size: "large", text: "continue_with", locale: "pt-BR", width: 300 });
    $("#botao-google").hidden = false;
    $("#separador-google").hidden = false;
  };
  document.head.append(script);
}

// Antes do login existir, os dados ficavam sem dono no aparelho. A primeira
// conta que entrar aqui fica com eles, para ninguém perder o cadastro.
async function trazerDadosAntigos() {
  try {
    if (localStorage.getItem(prefixo() + CHAVES.perfil) || !localStorage.getItem(CHAVES.perfil)) return;
    for (const chave of Object.values(CHAVES)) {
      const valor = localStorage.getItem(chave);
      if (valor !== null) localStorage.setItem(prefixo() + chave, valor);
      localStorage.removeItem(chave);
    }
    localStorage.removeItem("codigoAcesso");
  } catch {
    return;
  }
  const perfil = ler(CHAVES.perfil, {});
  const antigas = await new Promise((resolve) => {
    const pedido = indexedDB.open("conteudo-instagram", 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore("fotos", { keyPath: "id" });
    pedido.onerror = () => resolve([]);
    pedido.onsuccess = () => {
      const db = pedido.result;
      const leitura = db.transaction("fotos").objectStore("fotos").getAll();
      leitura.onsuccess = () => {
        db.close();
        resolve(leitura.result);
      };
      leitura.onerror = () => resolve([]);
    };
  });
  for (const foto of antigas) {
    if ((perfil.fotos || []).some((f) => f.id === foto.id)) await fotosDb.guardar(foto);
  }
  indexedDB.deleteDatabase("conteudo-instagram");
}

let ultimaConta = null;

async function abrirConta(dados) {
  // A sessão venceu e entrou outra pessoa: recarrega para limpar a tela.
  if (ultimaConta && ultimaConta !== dados.id) return location.reload();
  ultimaConta = dados.id;
  usuario = dados;
  $("#conta-email").textContent = usuario.email;
  $("#conta").hidden = false;
  await trazerDadosAntigos();
  const perfil = ler(CHAVES.perfil, null);
  // Quem veio da primeira versão ainda não deu a autorização: passa pelo cadastro.
  if (perfil?.produtos && perfil.autorizacao?.aceita) mostrarPainel();
  else mostrarCadastro();
}

$("#botao-sair").addEventListener("click", async () => {
  await fetch("/api/sair", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  window.google?.accounts?.id?.disableAutoSelect?.();
  // Recarrega para não sobrar nada da conta anterior na tela.
  location.reload();
});

// ---------- Início ----------

async function iniciar() {
  preencherSemanas();
  if (location.protocol === "file:") {
    // Aberto com dois cliques no index.html: sem o servidor, nada pode ser gerado.
    mostrarAviso("Esta página precisa ser aberta pelo endereço http://localhost:3000, com o “npm start” rodando. Abrir o arquivo index.html direto não funciona.", "atencao");
  }
  try {
    config = await (await fetch("/api/config")).json();
  } catch {}
  if (!config.chaveConfigurada) {
    mostrarAviso("O site ainda não está configurado: falta a chave da API do Claude. Veja o README.", "atencao");
  }
  // Calendário mensal da versão anterior não é mais usado.
  try {
    localStorage.removeItem("calendario");
  } catch {}
  prepararGoogle();
  try {
    const resposta = await fetch("/api/eu");
    if (resposta.ok) return abrirConta((await resposta.json()).usuario);
  } catch {}
  mostrarLogin();
}

iniciar();
