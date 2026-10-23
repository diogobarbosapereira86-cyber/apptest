// Tudo o que o dono preenche e gera fica salvo neste aparelho (localStorage).
const CHAVES = {
  perfil: "perfil",
  calendario: "calendario",
  feitos: "postsFeitos",
  ideias: "ideias",
  dicas: "dicas",
  dicasFeitas: "dicasFeitas",
  codigo: "codigoAcesso",
};

function ler(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor ? JSON.parse(valor) : padrao;
  } catch {
    return padrao;
  }
}

function salvar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento (aba anônima, por exemplo): a página segue funcionando.
  }
}

function apagarTudo() {
  Object.values(CHAVES).forEach((chave) => {
    try {
      localStorage.removeItem(chave);
    } catch {}
  });
}

const $ = (seletor) => document.querySelector(seletor);

function el(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

let config = { pedeCodigo: false, chaveConfigurada: true };

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
  const carregando = $(idCarregando);
  carregando.hidden = false;
  botao.disabled = true;
  try {
    const resposta = await fetch(caminho, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-codigo-acesso": ler(CHAVES.codigo, ""),
      },
      body: JSON.stringify({ perfil: ler(CHAVES.perfil, null), ...corpo }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (dados.pedeCodigo) $("#caixa-codigo").hidden = false;
      throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
    }
    return dados;
  } catch (erro) {
    const mensagem =
      erro instanceof TypeError ? "Sem conexão com o site. Verifique a internet e tente de novo." : erro.message;
    mostrarAviso(mensagem);
    return null;
  } finally {
    carregando.hidden = true;
    botao.disabled = false;
  }
}

// ---------- Cadastro ----------

const formPerfil = $("#form-perfil");

function preencherFormulario(perfil) {
  if (!perfil) return;
  for (const [campo, valor] of Object.entries(perfil)) {
    // Funciona para campos comuns e para o grupo de opções do tom de voz.
    const entrada = formPerfil.elements[campo];
    if (entrada) entrada.value = valor;
  }
  $("#campo-tipo-outro").hidden = perfil.tipo !== "Outro";
}

$("#tipo").addEventListener("change", (evento) => {
  $("#campo-tipo-outro").hidden = evento.target.value !== "Outro";
});

formPerfil.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const perfil = Object.fromEntries(new FormData(formPerfil).entries());
  perfil.instagram = perfil.instagram?.trim();
  if (perfil.instagram && !perfil.instagram.startsWith("@")) perfil.instagram = `@${perfil.instagram}`;
  salvar(CHAVES.perfil, perfil);
  mostrarPainel();
  window.scrollTo({ top: 0 });
});

// ---------- Telas e abas ----------

function mostrarCadastro() {
  preencherFormulario(ler(CHAVES.perfil, null));
  $("#tela-painel").hidden = true;
  $("#tela-cadastro").hidden = false;
  $("#nome-negocio").textContent = "";
}

function mostrarPainel() {
  const perfil = ler(CHAVES.perfil, null);
  $("#tela-cadastro").hidden = true;
  $("#tela-painel").hidden = false;
  $("#nome-negocio").textContent = perfil?.nome || "";
  desenharCalendario();
  desenharIdeias();
  desenharDicas();
}

function abrirAba(nome) {
  document.querySelectorAll(".aba").forEach((aba) => {
    aba.setAttribute("aria-selected", String(aba.dataset.aba === nome));
  });
  document.querySelectorAll(".painel").forEach((painel) => {
    painel.hidden = painel.dataset.painel !== nome;
  });
  esconderAviso();
}

document.querySelectorAll(".aba").forEach((aba) => {
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

// ---------- Cartão de post (calendário e ideias) ----------

function formatarData(data) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function cartaoDePost(item, { quando, hora, chaveFeito }) {
  const cartao = $("#modelo-post").content.firstElementChild.cloneNode(true);
  cartao.querySelector(".post-dia").textContent = quando;
  cartao.querySelector(".post-hora").textContent = hora || "";
  const selo = cartao.querySelector(".selo");
  selo.textContent = item.formato;
  selo.dataset.formato = item.formato;
  cartao.querySelector(".post-titulo").textContent = item.titulo;
  const objetivo = cartao.querySelector(".post-objetivo");
  if (item.objetivo) objetivo.textContent = `Objetivo: ${item.objetivo}`;
  else objetivo.remove();
  cartao.querySelector(".post-ideia").textContent = item.ideia;
  const roteiro = cartao.querySelector(".post-roteiro");
  (item.roteiro || []).forEach((passo) => roteiro.append(el("li", "", passo)));
  cartao.querySelector(".post-legenda").textContent = item.legenda;
  cartao.querySelector(".post-hashtags").textContent = (item.hashtags || []).join(" ");
  const botaoCopiar = cartao.querySelector("[data-copiar]");
  botaoCopiar.addEventListener("click", () => copiar(textoParaCopiar(item), botaoCopiar));

  const feito = cartao.querySelector(".feito");
  if (chaveFeito) {
    const caixa = feito.querySelector("input");
    const feitos = ler(CHAVES.feitos, {});
    caixa.checked = Boolean(feitos[chaveFeito]);
    cartao.classList.toggle("concluido", caixa.checked);
    caixa.addEventListener("change", () => {
      const atuais = ler(CHAVES.feitos, {});
      if (caixa.checked) atuais[chaveFeito] = true;
      else delete atuais[chaveFeito];
      salvar(CHAVES.feitos, atuais);
      cartao.classList.toggle("concluido", caixa.checked);
      atualizarProgresso();
    });
  } else {
    feito.remove();
  }
  return cartao;
}

// ---------- Calendário ----------

function preencherMeses() {
  const seletor = $("#mes");
  const hoje = new Date();
  for (let i = 0; i < 3; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const valor = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    const nome = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    seletor.append(new Option(nome.charAt(0).toUpperCase() + nome.slice(1), valor));
  }
}

function semanaDoMes(data) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1).getDay();
  return Math.floor((dia + primeiroDia - 1) / 7) + 1;
}

function atualizarProgresso() {
  const calendario = ler(CHAVES.calendario, null);
  const alvo = $("#progresso");
  if (!calendario || !alvo) return;
  const feitos = ler(CHAVES.feitos, {});
  const total = calendario.posts.length;
  const prontos = calendario.posts.filter((post) => feitos[`${calendario.mes}:${post.data}`]).length;
  alvo.querySelector(".progresso-texto").textContent = `${prontos} de ${total} posts feitos`;
  alvo.querySelector(".progresso-barra span").style.width = `${total ? (prontos / total) * 100 : 0}%`;
}

function desenharCalendario() {
  const destino = $("#resultado-calendario");
  destino.replaceChildren();
  const calendario = ler(CHAVES.calendario, null);
  if (!calendario) {
    destino.append(el("p", "vazio", "Você ainda não tem um calendário. Escolha o mês acima e toque em “Criar calendário do mês”."));
    return;
  }

  const [ano, mes] = calendario.mes.split("-").map(Number);
  const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const cabecalho = el("div", "caixa");
  cabecalho.append(el("h2", "", `Seu plano para ${nomeMes}`));
  cabecalho.append(el("p", "", calendario.estrategia));
  const progresso = el("div", "progresso");
  progresso.id = "progresso";
  progresso.append(el("span", "progresso-texto"));
  const barra = el("div", "progresso-barra");
  barra.append(el("span"));
  progresso.append(barra);
  cabecalho.append(progresso);
  destino.append(cabecalho);

  let semanaAtual = 0;
  let lista;
  for (const post of calendario.posts) {
    const semana = semanaDoMes(post.data);
    if (semana !== semanaAtual) {
      semanaAtual = semana;
      destino.append(el("h3", "titulo-semana", `Semana ${semana}`));
      lista = el("div", "lista");
      destino.append(lista);
    }
    const dia = post.diaDaSemana.charAt(0).toUpperCase() + post.diaDaSemana.slice(1);
    const quando = `${dia}, ${formatarData(post.data)}`;
    lista.append(cartaoDePost(post, { quando, hora: `às ${post.horario}`, chaveFeito: `${calendario.mes}:${post.data}` }));
  }
  atualizarProgresso();
}

$("#botao-calendario").addEventListener("click", async (evento) => {
  const mes = $("#mes").value;
  const resultado = await pedir("/api/calendario", { mes }, "#carregando-calendario", evento.currentTarget);
  if (!resultado) return;
  salvar(CHAVES.calendario, resultado);
  desenharCalendario();
  $("#resultado-calendario").scrollIntoView({ behavior: "smooth" });
});

// ---------- Ideias ----------

function desenharIdeias() {
  const destino = $("#resultado-ideias");
  destino.replaceChildren();
  const ideias = ler(CHAVES.ideias, []);
  if (!ideias.length) return;
  destino.append(el("h3", "titulo-semana", "Suas ideias"));
  const lista = el("div", "lista");
  ideias.forEach((ideia) => lista.append(cartaoDePost(ideia, { quando: ideia.quando_postar })));
  destino.append(lista);
}

$("#botao-ideias").addEventListener("click", async (evento) => {
  const calendario = ler(CHAVES.calendario, null);
  const anteriores = ler(CHAVES.ideias, []);
  const titulosExistentes = [...(calendario?.posts || []), ...anteriores].map((item) => item.titulo);
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
    cartao.append(el("p", "post-ideia", dica.por_que));
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
    rotulo.append(caixa, " Já fiz");
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

$("#botao-editar-perfil").addEventListener("click", mostrarCadastro);
$("#botao-apagar").addEventListener("click", () => ($("#confirmar-apagar").hidden = false));
$("#botao-apagar-nao").addEventListener("click", () => ($("#confirmar-apagar").hidden = true));
$("#botao-apagar-sim").addEventListener("click", () => {
  apagarTudo();
  formPerfil.reset();
  $("#confirmar-apagar").hidden = true;
  abrirAba("calendario");
  mostrarCadastro();
});

// ---------- Código de acesso ----------

$("#form-codigo").addEventListener("submit", (evento) => {
  evento.preventDefault();
  salvar(CHAVES.codigo, $("#codigo").value.trim());
  $("#caixa-codigo").hidden = true;
  esconderAviso();
});

// ---------- Início ----------

async function iniciar() {
  preencherMeses();
  try {
    config = await (await fetch("/api/config")).json();
  } catch {}
  if (config.pedeCodigo && !ler(CHAVES.codigo, "")) $("#caixa-codigo").hidden = false;
  if (!config.chaveConfigurada) {
    mostrarAviso("O site ainda não está configurado: falta a chave da API do Claude. Veja o README.", "atencao");
  }
  if (ler(CHAVES.perfil, null)) mostrarPainel();
  else mostrarCadastro();
}

iniciar();
