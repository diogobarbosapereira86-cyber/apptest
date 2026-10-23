// Monta os dias da semana do calendário: todo dia tem story, e o feed sai
// só em alguns dias. As datas são calculadas aqui, e não pela IA, para que
// dia do mês e dia da semana estejam sempre certos.

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// Dias da semana com post no feed para cada quantidade de posts por semana
// (0 = domingo). Sexta e sábado entram primeiro porque são os dias de mais
// movimento para a maioria dos pequenos negócios.
const DIAS_POR_FREQUENCIA = {
  1: [5],
  2: [3, 5],
  3: [2, 4, 6],
  4: [2, 4, 5, 6],
  5: [1, 3, 4, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function paraData(texto) {
  const [ano, mes, dia] = texto.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function paraTexto(data) {
  return data.toISOString().slice(0, 10);
}

// A semana começa na segunda-feira.
export function segundaValida(segunda) {
  if (typeof segunda !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(segunda)) return false;
  const data = paraData(segunda);
  return paraTexto(data) === segunda && data.getUTCDay() === 1;
}

export function frequenciaDoFeed(postsPorSemana) {
  const numero = Number(postsPorSemana);
  return Number.isFinite(numero) ? Math.min(7, Math.max(1, Math.round(numero))) : 3;
}

export function diasDaSemana(segunda, postsPorSemana) {
  const diasComFeed = DIAS_POR_FREQUENCIA[frequenciaDoFeed(postsPorSemana)];
  const inicio = paraData(segunda);
  return Array.from({ length: 7 }, (_, i) => {
    const data = new Date(inicio);
    data.setUTCDate(inicio.getUTCDate() + i);
    const diaSemana = data.getUTCDay();
    return {
      data: paraTexto(data),
      diaDaSemana: DIAS_DA_SEMANA[diaSemana],
      temFeed: diasComFeed.includes(diaSemana),
    };
  });
}

export function descreverPeriodo(segunda) {
  const dias = diasDaSemana(segunda, 1);
  const formato = { day: "numeric", month: "long", timeZone: "UTC" };
  const inicio = paraData(dias[0].data).toLocaleDateString("pt-BR", formato);
  const fim = paraData(dias[6].data).toLocaleDateString("pt-BR", formato);
  return `de ${inicio} a ${fim}`;
}
