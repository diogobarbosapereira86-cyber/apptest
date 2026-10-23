// Escolhe em quais dias do mês sai cada post. As datas são calculadas aqui,
// e não pela IA, para que dia do mês e dia da semana estejam sempre certos.

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// Dias da semana usados para cada quantidade de posts por semana
// (0 = domingo). Sexta e sábado entram primeiro porque são os dias
// de mais movimento para a maioria dos pequenos negócios.
const DIAS_POR_FREQUENCIA = {
  1: [5],
  2: [3, 5],
  3: [2, 4, 6],
  4: [2, 4, 5, 6],
  5: [1, 3, 4, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function mesValido(mes) {
  if (typeof mes !== "string" || !/^\d{4}-\d{2}$/.test(mes)) return false;
  const [, m] = mes.split("-").map(Number);
  return m >= 1 && m <= 12;
}

export function nomeDoMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  const nome = new Date(Date.UTC(ano, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
  return `${nome} de ${ano}`;
}

export function datasDoMes(mes, postsPorSemana) {
  const numero = Number(postsPorSemana);
  const freq = Number.isFinite(numero) ? Math.min(7, Math.max(1, Math.round(numero))) : 3;
  const dias = DIAS_POR_FREQUENCIA[freq];
  const [ano, m] = mes.split("-").map(Number);
  const totalDias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const datas = [];
  for (let d = 1; d <= totalDias; d++) {
    const data = new Date(Date.UTC(ano, m - 1, d));
    const diaSemana = data.getUTCDay();
    if (dias.includes(diaSemana)) {
      datas.push({
        data: `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        diaDaSemana: DIAS_DA_SEMANA[diaSemana],
      });
    }
  }
  return datas;
}
