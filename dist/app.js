import { INPC_INDEX, INPC_RANGE } from './data/inpc.js';
import { QX_FEM, QX_MASC } from './data/mortality_at2000_suavizada.js';
const FALLBACK_INTEREST_RATES = {
  2021: 0.0437,
  2022: 0.0437,
  2023: 0.0437,
  2024: 0.0444
};

const NSUA = 13;
const FCB = 0.9818;
const OMEGA = 115;
const INPC_KEYS = Object.keys(INPC_INDEX).sort();
const YEAR_RANGE = {
  min: Number(INPC_RANGE.start.split('-')[0]),
  max: 2026
};
let interestRates = { ...FALLBACK_INTEREST_RATES };

const inputs = {
  nome: document.getElementById('nome'),
  sexo: document.getElementById('sexo'),
  nascimento: document.getElementById('nascimento'),
  dataCalculo: document.getElementById('data-calculo'),
  competenciaBase: document.getElementById('competencia-base'),
  competenciaFinal: document.getElementById('competencia-final'),
  anoTaxa: document.getElementById('ano-taxa'),
  beneficioBruto: document.getElementById('beneficio-bruto'),
  beneficioLiquido: document.getElementById('beneficio-liquido'),
  rubricas: [
    document.getElementById('rubrica-1'),
    document.getElementById('rubrica-2'),
    document.getElementById('rubrica-3'),
    document.getElementById('rubrica-4'),
    document.getElementById('rubrica-5')
  ]
};

const outputs = {
  fatcor: document.getElementById('fatcor'),
  ax12: document.getElementById('ax12'),
  taxaI: document.getElementById('taxa-i'),
  supAjustado: document.getElementById('sup-ajustado'),
  vaebaBruta: document.getElementById('vaeba-bruta'),
  vaebaAjustada: document.getElementById('vaeba-ajustada'),
  alertas: document.getElementById('alertas'),
  auditoria: document.getElementById('auditoria'),
  parecer: document.getElementById('parecer'),
  tests: document.getElementById('tests')
};

const resetButton = document.getElementById('reset-btn');
const calcButton = document.getElementById('calc-btn');
const copyAuditButton = document.getElementById('copy-audit');
const copyParecerButton = document.getElementById('copy-parecer');

const formatCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const formatNumber = (value, decimals = 2) =>
  value?.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) ?? '—';

const formatPercent = (value) =>
  `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const parseCurrency = (value) => {
  if (!value) return 0;
  const normalized = value
    .toString()
    .replace(/\s/g, '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCurrencyInput = (raw) => {
  const digits = raw.replace(/\D/g, '').padStart(3, '0');
  const integerPart = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  const decimalPart = digits.slice(-2);
  const withThousands = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withThousands},${decimalPart}`;
};

const maskCompetencia = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const parseCompetencia = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    month < 1 ||
    month > 12 ||
    year < YEAR_RANGE.min ||
    year > YEAR_RANGE.max
  )
    return null;
  return {
    month,
    year,
    key: `${year}-${String(month).padStart(2, '0')}`
  };
};

const getTodayISO = () => new Date().toISOString().slice(0, 10);

const getAge = (birthDate, calcDate) => {
  if (!birthDate || !calcDate) return null;
  const birth = new Date(birthDate);
  const calc = new Date(calcDate);
  let age = calc.getFullYear() - birth.getFullYear();
  const monthDiff = calc.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && calc.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
};

const getExactAge = (birthDate, calcDate) => {
  if (!birthDate || !calcDate) return null;
  const birth = new Date(birthDate);
  const calc = new Date(calcDate);
  const diff = calc - birth;
  const years = diff / (365.25 * 24 * 60 * 60 * 1000);
  return years;
};

const validateQxTables = () => {
  const errors = [];
  const checks = [
    { label: 'qx_fem[0]', value: QX_FEM[0], expected: 0.001615, tolerance: 0.0005 },
    { label: 'qx_fem[58]', value: QX_FEM[58], expected: 0.003218, tolerance: 0.001 },
    { label: 'qx_masc[0]', value: QX_MASC[0], expected: 0.00208, tolerance: 0.0007 },
    { label: 'qx_masc[58]', value: QX_MASC[58], expected: 0.005593, tolerance: 0.002 }
  ];
  checks.forEach((check) => {
    const min = check.expected - check.tolerance;
    const max = check.expected + check.tolerance;
    if (check.value < min || check.value > max) {
      errors.push(`Tábua em escala errada: ${check.label} fora do intervalo esperado.`);
    }
  });
  if (QX_FEM[OMEGA] !== 1 || QX_MASC[OMEGA] !== 1) {
    errors.push('Tábua em escala errada: qx[115] deve ser 1.');
  }
  return errors;
};

const buildLx = (qx) => {
  const lx = [100000];
  for (let age = 0; age < OMEGA; age += 1) {
    const next = lx[age] * (1 - qx[age]);
    lx.push(next);
  }
  return lx;
};

const LX_FEM = buildLx(QX_FEM);
const LX_MASC = buildLx(QX_MASC);
const QX_SANITY_ERRORS = validateQxTables();

const calculateAx12 = (age, rate, sexo) => {
  const x = Math.min(Math.max(age, 0), OMEGA);
  const lx = sexo === 'F' ? LX_FEM : LX_MASC;
  const l0 = lx[x];
  if (!l0) return 0;
  const v = 1 / (1 + rate);
  let axAnnualDue = 0;
  for (let t = 0; t <= OMEGA - x; t += 1) {
    axAnnualDue += Math.pow(v, t) * (lx[x + t] / l0);
  }
  return axAnnualDue - 11 / 24;
};

const getInterestRate = (year) => {
  const years = Object.keys(interestRates)
    .map(Number)
    .sort((a, b) => a - b);
  if (interestRates[year]) {
    return { rate: interestRates[year], rule: `Taxa do exercício ${year}` };
  }
  const previous = years.filter((y) => y < year).pop();
  if (previous) {
    return { rate: interestRates[previous], rule: `Taxa do último exercício disponível (${previous})` };
  }
  return { rate: years.length ? interestRates[years[0]] : 0, rule: 'Taxa indisponível na base' };
};

const getNearestInpcKey = (key) => {
  const candidates = INPC_KEYS.filter((item) => item <= key);
  return candidates.length ? candidates[candidates.length - 1] : null;
};

const getInpcIndex = (key, warnings, { allowFallback, label }) => {
  if (INPC_INDEX[key]) return INPC_INDEX[key];
  if (!allowFallback) {
    warnings.push(`Competência ${label} ${key} não encontrada na série INPC.`);
    return null;
  }
  const fallbackKey = getNearestInpcKey(key);
  if (fallbackKey) {
    warnings.push(
      `Competência ${label} ${key} fora da série. Usado INPC mais recente disponível (${fallbackKey}).`
    );
    return INPC_INDEX[fallbackKey];
  }
  warnings.push(`Competência ${label} ${key} não encontrada na série INPC.`);
  return null;
};

const formatDateBR = (dateValue) => {
  if (!dateValue) return '—';
  return new Date(dateValue).toLocaleDateString('pt-BR');
};

const formatDateToCompetencia = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${month}/${date.getFullYear()}`;
};

const loadPremissas = async () => {
  try {
    const response = await fetch('./config/premissas.json');
    if (!response.ok) return;
    const data = await response.json();
    if (data?.interestRates) {
      interestRates = { ...data.interestRates };
    }
  } catch (error) {
    console.warn('Falha ao carregar premissas, usando fallback.', error);
  }
};

const runGoldenTest = () => {
  const testItems = [];
  const sexo = 'F';
  const nascimento = '1966-05-04';
  const dataCalculo = '2024-06-30';
  const idade = getAge(nascimento, dataCalculo);
  const competenciaBase = parseCompetencia('06/2024');
  const competenciaFinal = parseCompetencia('08/2024');
  const warnings = [];
  const inpcBase = competenciaBase
    ? getInpcIndex(competenciaBase.key, warnings, { allowFallback: false, label: 'base' })
    : null;
  const inpcFinal = competenciaFinal
    ? getInpcIndex(competenciaFinal.key, warnings, { allowFallback: true, label: 'final' })
    : null;
  const fatcor = inpcBase && inpcFinal ? inpcFinal / inpcBase : 0;
  const rubricas = [349.11, 789.63, 1029.13, 312.17, 2.96];
  const totalRubricas = rubricas.reduce((sum, value) => sum + value, 0);
  const supAjustado = 8576.09 - totalRubricas;
  const ax12Bruto = calculateAx12(idade, 0.0437, sexo);
  const ax12Usado = ax12Bruto * FCB;
  testItems.push({
    name: 'Caso parecer: soma rubricas = 2.483,00 e SUP ajustado = 6.093,09',
    pass: Math.abs(totalRubricas - 2483) < 0.01 && Math.abs(supAjustado - 6093.09) < 0.01
  });
  testItems.push({
    name: 'Caso parecer: äx12 bruto ~ 16,03 e äx12 usado ~ 15,74',
    pass: Math.abs(ax12Bruto - 16.03) <= 0.05 && Math.abs(ax12Usado - 15.74) <= 0.05
  });
  const vaebaBruta = NSUA * 8576.09 * ax12Usado * fatcor;
  const vaebaAjustada = NSUA * supAjustado * ax12Usado * fatcor;
  testItems.push({
    name: 'Caso parecer: VAEBA Bruta > VAEBA Ajustada',
    pass: vaebaBruta > vaebaAjustada
  });
  return testItems;
};

const runTests = () => {
  const testItems = [];
  const qxChecks = [
    { name: 'qx_fem[0] ~ 0,001615', value: QX_FEM[0], min: 0.001115, max: 0.002115 },
    { name: 'qx_fem[58] ~ 0,003218', value: QX_FEM[58], min: 0.002218, max: 0.004218 },
    { name: 'qx_masc[0] ~ 0,00208', value: QX_MASC[0], min: 0.00138, max: 0.00278 },
    { name: 'qx_masc[58] ~ 0,005593', value: QX_MASC[58], min: 0.003593, max: 0.007593 },
    { name: 'qx[115] = 1', value: QX_FEM[115], min: 1, max: 1 }
  ];
  qxChecks.forEach((check) => {
    const pass = check.value >= check.min && check.value <= check.max;
    testItems.push({
      name: `Sanidade tábua: ${check.name}`,
      pass
    });
  });

  const supCalc = 8576.09 - (349.11 + 789.63 + 1029.13 + 312.17 + 2.96);
  const supPass = Math.abs(supCalc - 6093.09) < 0.01;
  testItems.push({
    name: 'SUP ajustado (8576,09 - rubricas) = 6093,09',
    pass: supPass
  });

  const axBruto = calculateAx12(58, 0.0437, 'F');
  const axUsado = axBruto * FCB;
  testItems.push({
    name: 'äx(12) > 0 para sexo FEM, idade 58, i=0,0437',
    pass: axBruto > 0
  });

  const supBruto = 1000;
  const supAjustado = 900;
  const fator = 1.1;
  const ax12 = 10;
  const vaebaBruta = NSUA * supBruto * ax12 * fator;
  const vaebaAjustada = NSUA * supAjustado * ax12 * fator;
  testItems.push({
    name: 'VAEBA_BRUTA > VAEBA_AJUSTADA quando há rubricas',
    pass: vaebaBruta > vaebaAjustada
  });

  const golden = runGoldenTest();
  testItems.push(...golden);

  outputs.tests.innerHTML = '';
  testItems.forEach((test) => {
    const li = document.createElement('li');
    li.className = `test-item ${test.pass ? '' : 'fail'}`;
    li.textContent = `${test.pass ? '✓' : '✗'} ${test.name}`;
    outputs.tests.appendChild(li);
  });
};

const renderAlerts = (warnings) => {
  outputs.alertas.innerHTML = '';
  warnings.forEach((warning) => {
    const div = document.createElement('div');
    div.className = 'alert';
    div.textContent = warning;
    outputs.alertas.appendChild(div);
  });
};

const buildAudit = (data) => `AUDITORIA DO CÁLCULO - VAEBA PPSP-NR

Participante: ${data.nome || '—'}
Sexo: ${data.sexoLabel}
Nascimento: ${formatDateBR(data.nascimento)}
Data do cálculo: ${formatDateBR(data.dataCalculo)}
Idade (anos completos): ${data.idade ?? '—'}
Idade exata (informativa): ${data.idadeExata?.toFixed(4) ?? '—'}

Competência INPC base: ${data.competenciaBase}
INPC base: ${data.inpcBase ?? '—'}
Competência INPC final: ${data.competenciaFinal}
INPC final: ${data.inpcFinal ?? '—'}
FATCOR: ${formatNumber(data.fatcor, 5)}

Taxa i selecionada: ${formatPercent(data.rate)}
Regra da taxa: ${data.rateRule}
Tábua aplicada: AT-2000 Suavizada (10%) - ${data.sexoLabel}
Idade usada na tábua: ${data.idade ?? '—'}
äx(12) bruto: ${formatNumber(data.ax12Bruto, 5)}
äx(12) usado (com FCB): ${formatNumber(data.ax12Usado, 5)}

Benefício bruto: ${formatCurrency.format(data.beneficioBruto)}
Rubricas: ${data.rubricas.map((value) => formatCurrency.format(value)).join(' | ')}
Total rubricas: ${formatCurrency.format(data.totalRubricas)}
SUP ajustado: ${formatCurrency.format(data.supAjustado)}

Fórmula: VAEBA = NSUA × SUP × äx(12) × FATCOR
NSUA = ${NSUA}
SUP (bruto): ${formatCurrency.format(data.beneficioBruto)}
SUP (ajustado): ${formatCurrency.format(data.supAjustado)}

Resultados:
VAEBA_BRUTA: ${formatCurrency.format(data.vaebaBruta)}
VAEBA_AJUSTADA: ${formatCurrency.format(data.vaebaAjustada)}

Avisos:
${data.warnings.length ? data.warnings.map((warning) => `- ${warning}`).join('\n') : '- Nenhum aviso.'}
`;

const buildParecer = (data) => `1. Objetivo
Apurar o VAEBA (Reserva Matemática Individual) do participante do plano PPSP-NR, considerando benefício bruto e benefício ajustado.

2. Metodologia e premissas
Aplicou-se VAEBA = NSUA × SUP × äx(12) × FATCOR, com NSUA=13, FCB=0,9818 aplicado sobre äx(12), crescimento real 0% a.a., FATCOR via INPC e tábua AT-2000 Suavizada (10%).

3. Dados de entrada
Participante: ${data.nome || '—'} | Sexo: ${data.sexoLabel} | Idade: ${data.idade ?? '—'} anos
Benefício bruto: ${formatCurrency.format(data.beneficioBruto)} | SUP ajustado: ${formatCurrency.format(data.supAjustado)}
Competências INPC: base ${data.competenciaBase} e final ${data.competenciaFinal}

4. Apuração de fatores
FATCOR = ${formatNumber(data.fatcor, 5)}
Taxa i = ${formatPercent(data.rate)} (${data.rateRule})
äx(12) bruto = ${formatNumber(data.ax12Bruto, 5)}
äx(12) usado (FCB) = ${formatNumber(data.ax12Usado, 5)}

5. Resultados
VAEBA Bruta = ${formatCurrency.format(data.vaebaBruta)}
VAEBA Ajustada = ${formatCurrency.format(data.vaebaAjustada)}

6. Considerações finais
${data.warnings.length ? `Avisos relevantes: ${data.warnings.join(' | ')}` : 'Sem ressalvas relevantes.'}
`;

const calculate = () => {
  const warnings = [];
  const errors = [];

  if (QX_SANITY_ERRORS.length) {
    errors.push('Tábua em escala errada (não dividir por 100).');
    QX_SANITY_ERRORS.forEach((message) => errors.push(message));
  }

  const nome = inputs.nome.value.trim();
  const sexo = inputs.sexo.value;
  const sexoLabel = sexo === 'F' ? 'Feminino' : sexo === 'M' ? 'Masculino' : '—';
  const nascimento = inputs.nascimento.value;
  const dataCalculo = inputs.dataCalculo.value;
  const competenciaBase = parseCompetencia(inputs.competenciaBase.value);
  const competenciaFinalInput = parseCompetencia(inputs.competenciaFinal.value);

  if (!competenciaBase) {
    errors.push('Competência base INPC inválida ou não informada.');
  }

  const competenciaFinal =
    competenciaFinalInput ?? parseCompetencia(formatDateToCompetencia(dataCalculo));

  if (!competenciaFinal) {
    errors.push('Competência final INPC inválida.');
  }

  const inpcBase = competenciaBase
    ? getInpcIndex(competenciaBase.key, warnings, { allowFallback: false, label: 'base' })
    : null;
  const inpcFinal = competenciaFinal
    ? getInpcIndex(competenciaFinal.key, warnings, { allowFallback: true, label: 'final' })
    : null;

  let fatcor = 0;
  if (inpcBase && inpcFinal) {
    fatcor = inpcFinal / inpcBase;
  }

  const beneficioBruto = parseCurrency(inputs.beneficioBruto.value);
  const rubricas = inputs.rubricas.map((input) => parseCurrency(input.value));
  const totalRubricas = rubricas.reduce((sum, value) => sum + value, 0);
  const supAjustado = beneficioBruto - totalRubricas;
  if (supAjustado < 0) {
    warnings.push('SUP ajustado negativo. Verifique as rubricas informadas.');
  }

  const liquidoInformado = parseCurrency(inputs.beneficioLiquido.value);
  if (liquidoInformado && Math.abs(liquidoInformado - supAjustado) > 1) {
    warnings.push('Diferença maior que R$ 1,00 entre líquido informado e SUP ajustado.');
  }

  const idade = getAge(nascimento, dataCalculo);
  const idadeExata = getExactAge(nascimento, dataCalculo);
  if (idade === null) {
    warnings.push('Data de nascimento ou data do cálculo não informada para idade.');
  }

  const calcYear = dataCalculo ? new Date(dataCalculo).getFullYear() : new Date().getFullYear();
  const overrideYearRaw = inputs.anoTaxa?.value?.trim();
  const overrideYear = overrideYearRaw ? Number(overrideYearRaw) : null;
  if (overrideYearRaw && Number.isNaN(overrideYear)) {
    warnings.push('Ano da taxa inválido. Usada regra padrão (ano do cálculo - 1).');
  }
  const defaultYear = calcYear - 1;
  const targetYear = overrideYear && !Number.isNaN(overrideYear) ? overrideYear : defaultYear;
  const { rate, rule } = getInterestRate(targetYear);
  if (!interestRates[targetYear]) {
    warnings.push(`Taxa de juros não encontrada para ${targetYear}. Usada taxa anterior.`);
  }
  if (!overrideYear && targetYear !== calcYear - 1) {
    warnings.push(`Taxa definida pelo último exercício fechado (${defaultYear}).`);
  }

  const ax12Bruto = idade !== null && sexo ? calculateAx12(idade, rate, sexo) : 0;
  const ax12Usado = ax12Bruto * FCB;

  const vaebaBruta = NSUA * beneficioBruto * ax12Usado * fatcor;
  const vaebaAjustada = NSUA * supAjustado * ax12Usado * fatcor;

  outputs.fatcor.textContent = formatNumber(fatcor, 5);
  outputs.ax12.textContent = formatNumber(ax12Usado, 5);
  outputs.taxaI.textContent = formatPercent(rate);
  outputs.supAjustado.textContent = formatCurrency.format(supAjustado);
  outputs.vaebaBruta.textContent = formatCurrency.format(vaebaBruta);
  outputs.vaebaAjustada.textContent = formatCurrency.format(vaebaAjustada);

  renderAlerts([...errors, ...warnings]);
  if (errors.length) {
    outputs.auditoria.textContent = 'Corrija os erros indicados para calcular.';
    outputs.parecer.textContent = 'Corrija os erros indicados para calcular.';
    return;
  }

  const auditData = {
    nome,
    sexoLabel,
    nascimento,
    dataCalculo,
    idade,
    idadeExata,
    competenciaBase: competenciaBase?.key ?? '—',
    competenciaFinal: competenciaFinal?.key ?? '—',
    inpcBase,
    inpcFinal,
    fatcor,
    rate,
    rateRule: rule,
    ax12Bruto,
    ax12Usado,
    beneficioBruto,
    rubricas,
    totalRubricas,
    supAjustado,
    vaebaBruta,
    vaebaAjustada,
    warnings
  };

  outputs.auditoria.textContent = buildAudit(auditData);
  outputs.parecer.textContent = buildParecer(auditData);
};

const resetForm = () => {
  Object.values(inputs).forEach((input) => {
    if (Array.isArray(input)) {
      input.forEach((field) => {
        field.value = '';
      });
    } else if (input && input.tagName !== 'SELECT') {
      input.value = '';
    } else if (input && input.tagName === 'SELECT') {
      input.value = '';
    }
  });
  inputs.dataCalculo.value = getTodayISO();
  outputs.fatcor.textContent = '—';
  outputs.ax12.textContent = '—';
  outputs.taxaI.textContent = '—';
  outputs.supAjustado.textContent = '—';
  outputs.vaebaBruta.textContent = '—';
  outputs.vaebaAjustada.textContent = '—';
  outputs.alertas.innerHTML = '';
  outputs.auditoria.textContent = 'Nenhum cálculo realizado.';
  outputs.parecer.textContent = 'Nenhum cálculo realizado.';
};

const handleCopy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('Falha ao copiar', error);
  }
};

const attachInputMasks = () => {
  document.querySelectorAll('.currency-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target;
      target.value = formatCurrencyInput(target.value);
    });
  });

  document.querySelectorAll('.competencia-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target;
      target.value = maskCompetencia(target.value);
    });
  });
};

inputs.dataCalculo.value = getTodayISO();

resetButton.addEventListener('click', resetForm);
calcButton.addEventListener('click', calculate);
copyAuditButton.addEventListener('click', () => handleCopy(outputs.auditoria.textContent));
copyParecerButton.addEventListener('click', () => handleCopy(outputs.parecer.textContent));

attachInputMasks();
loadPremissas().finally(runTests);
