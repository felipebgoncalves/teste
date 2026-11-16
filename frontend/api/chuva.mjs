const tokenUrl = process.env.SIMET_TOKEN_URL || 'https://sistemas.cb.es.gov.br/keycloak/realms/sistemas-cepdec/protocol/openid-connect/token';
const baseUrl = process.env.SIMET_BASE_URL || 'https://sistemas.cb.es.gov.br/simet-api/';
let cachedToken;
let tokenExpiresAt = 0;

async function accessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SIMET_CLIENT_ID,
    client_secret: process.env.SIMET_CLIENT_SECRET,
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Token HTTP ${response.status}`);
  const result = await response.json();
  if (!result.access_token) throw new Error('Token ausente na resposta');
  cachedToken = result.access_token;
  tokenExpiresAt = Date.now() + Math.max(30, (result.expires_in || 300) - 30) * 1000;
  return cachedToken;
}

async function simetGet(path, params) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (params) url.search = params.toString();
  const request = async () => fetch(url, {
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'X-API-Key': process.env.SIMET_API_KEY,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  let response = await request();
  if (response.status === 401) {
    cachedToken = undefined;
    tokenExpiresAt = 0;
    response = await request();
  }
  if (!response.ok) throw new Error(`SIMET HTTP ${response.status}`);
  return response.json();
}

export async function GET() {
  if (!process.env.SIMET_CLIENT_ID || !process.env.SIMET_CLIENT_SECRET || !process.env.SIMET_API_KEY) {
    return Response.json({ erro: 'Configure SIMET_CLIENT_ID, SIMET_CLIENT_SECRET e SIMET_API_KEY na Vercel.' }, { status: 503 });
  }
  try {
    const fim = new Date();
    const inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000);
    const estacoes = await simetGet('v1/estacoes');
    const porCodigo = new Map(estacoes.map(e => [e.codigo, {
      codigo: e.codigo,
      nome: e.nome,
      municipio: e.municipio,
      total24h: 0,
      chuvaRecente: null,
      ultimaLeitura: null,
      medicoes: 0,
    }]));
    const vistos = new Set();
    let cursor = null;
    let paginas = 0;
    do {
      const params = new URLSearchParams({
        inicio_utc: inicio.toISOString(),
        fim_utc: fim.toISOString(),
        variavel: 'PRECIPITACAO_MM',
        intervalo_minutos: '15',
        limite: '500',
      });
      if (cursor) params.set('cursor', cursor);
      const pagina = await simetGet('v1/observacoes', params);
      for (const item of pagina.items || []) {
        const estacao = porCodigo.get(item.estacao_codigo);
        const valor = item.dados?.PRECIPITACAO_MM;
        const chave = `${item.estacao_codigo}:${item.data_hora_utc}`;
        if (!estacao || typeof valor !== 'number' || !Number.isFinite(valor) || vistos.has(chave)) continue;
        vistos.add(chave);
        estacao.total24h += valor;
        estacao.medicoes++;
        if (!estacao.ultimaLeitura || item.data_hora_utc > estacao.ultimaLeitura) {
          estacao.ultimaLeitura = item.data_hora_utc;
          estacao.chuvaRecente = valor;
        }
      }
      cursor = pagina.next_cursor || null;
      if (++paginas > 1000) throw new Error('Limite de paginação excedido');
    } while (cursor);
    for (const estacao of porCodigo.values()) estacao.total24h = Math.round(estacao.total24h * 100) / 100;
    return Response.json({ inicioUtc: inicio.toISOString(), fimUtc: fim.toISOString(), estacoes: [...porCodigo.values()], paginas }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const status = Number(/SIMET HTTP (\d+)/.exec(error.message)?.[1]);
    return Response.json({ erro: status ? `A API SIMET respondeu com HTTP ${status}.` : 'Não foi possível consultar a API SIMET.' }, {
      status: status >= 400 && status <= 599 ? status : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
