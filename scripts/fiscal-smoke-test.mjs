import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { buildFocusNfsePayload, extractFocusDocumentUrls } from '../server/fiscal/focusClient.ts';
import { defaultServiceFromCashLaunch, mapFocusStatus } from '../server/fiscal/fiscalStore.ts';

const port = Number(process.env.FISCAL_SMOKE_PORT || 3017);
const baseUrl = `http://127.0.0.1:${port}`;

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const startServer = () => spawn(
  process.execPath,
  ['--import', 'tsx', 'server.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
);

const waitForHealth = async (server) => {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      fail(`Servidor fiscal saiu antes do health. ExitCode=${server.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/fiscal/health`);
      const payload = await response.json();
      if (response.ok) return payload;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(1000);
  }

  fail(`Health fiscal nao respondeu em ${baseUrl}: ${lastError?.message || lastError}`);
};

const stopServer = async (server) => {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (server.exitCode !== null) return;
    await delay(300);
  }
  server.kill('SIGKILL');
};

const testInternalBuilders = () => {
  const company = {
    id: 'company-test',
    userId: 'user-test',
    legalName: 'MotoFix Teste',
    tradeName: 'MotoFix',
    document: '12.345.678/0001-90',
    municipalRegistration: '12345',
    stateRegistration: '',
    taxRegime: 'simples_nacional',
    cnae: '4520001',
    serviceCityCode: '1302603',
    serviceCityName: 'Manaus',
    address: 'Rua Teste',
    number: '10',
    district: 'Centro',
    city: 'Manaus',
    state: 'AM',
    zipCode: '69000000',
    email: 'teste@example.com',
    phone: '92999999999',
    focusEnvironment: 'homologation',
    nfseEnabled: true,
    nfeEnabled: false,
    nfceEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const invoice = {
    id: 'invoice-test',
    userId: 'user-test',
    companyId: company.id,
    companyDocument: company.document,
    model: 'nfse',
    environment: 'homologation',
    reference: 'MF-NFSE-SMOKE',
    status: 'draft',
    source: 'manual',
    customer: {
      name: 'Cliente Teste',
      document: '123.456.789-09',
      email: 'cliente@example.com',
      phone: '92988887777',
    },
    service: {
      description: 'Servico teste fiscal',
      amount: 150,
      serviceCode: '14.01',
      municipalTaxCode: '1401',
      cityCode: '1302603',
      issRate: 2,
      deductions: 0,
      withheldIss: false,
    },
    total: 150,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const payload = buildFocusNfsePayload(invoice, company);
  assert(payload.prestador?.cnpj === '12345678000190', 'Payload NFS-e nao normalizou CNPJ do prestador.');
  assert(payload.tomador?.cpf === '12345678909', 'Payload NFS-e nao normalizou CPF do tomador.');
  assert(payload.servico?.valor_servicos === 150, 'Payload NFS-e nao manteve valor do servico.');

  const urls = extractFocusDocumentUrls('homologation', {
    caminho_xml_nfse: '/xml/teste.xml',
    caminho_pdf_nfse: '/pdf/teste.pdf',
  });
  assert(urls.xmlUrl === 'https://homologacao.focusnfe.com.br/xml/teste.xml', 'URL XML da Focus nao foi resolvida.');
  assert(urls.pdfUrl === 'https://homologacao.focusnfe.com.br/pdf/teste.pdf', 'URL PDF da Focus nao foi resolvida.');

  const statusCases = {
    autorizado: 'authorized',
    cancelado: 'cancelled',
    rejeitado: 'rejected',
    processando: 'processing',
    qualquer: 'queued',
  };
  for (const [focusStatus, expected] of Object.entries(statusCases)) {
    assert(mapFocusStatus({ status: focusStatus }) === expected, `Status Focus ${focusStatus} nao mapeou para ${expected}.`);
  }

  const service = defaultServiceFromCashLaunch({
    orderNumber: 'LC-SMOKE',
    servicesExecuted: 'Troca de oleo',
    total: 120,
  });
  assert(service.description === 'Troca de oleo', 'Servico fiscal nao usou descricao da O.S.');
  assert(service.amount === 120, 'Servico fiscal nao usou total da O.S.');
};

const testLocalServer = async () => {
  const stdout = [];
  const stderr = [];
  const server = startServer();
  server.stdout.on('data', (chunk) => stdout.push(String(chunk)));
  server.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  try {
    const health = await waitForHealth(server);
    assert(health.status === 'ok', 'Health fiscal nao retornou status ok.');
    assert(health.provider === 'focus-nfe', 'Health fiscal nao retornou provider focus-nfe.');
    assert(health.firebaseInitialized === true, 'Firebase Admin nao inicializou no servidor fiscal local.');

    const protectedResponse = await fetch(`${baseUrl}/api/fiscal/companies`);
    assert(protectedResponse.status === 401, 'Rota fiscal protegida deveria retornar 401 sem token.');
  } finally {
    await stopServer(server);
    if (process.env.FISCAL_SMOKE_VERBOSE === '1') {
      console.log(stdout.join('').trim());
      console.error(stderr.join('').trim());
    }
  }
};

try {
  console.log('Iniciando smoke test do modulo fiscal...');
  testInternalBuilders();
  console.log('Builders fiscais OK.');
  await testLocalServer();
  console.log('API fiscal local OK.');
  console.log('Smoke test fiscal finalizado com sucesso.');
} catch (error) {
  console.error('Smoke test fiscal falhou:', error);
  process.exit(1);
}

