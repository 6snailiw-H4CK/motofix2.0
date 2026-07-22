import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_ACCOUNT_PATH = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json');
const API_KEY = process.env.VITE_FIREBASE_API_KEY;
const SERVER_BASE = process.env.WHATSAPP_API_BASE || 'http://localhost:3000';

if (!API_KEY) {
  console.error('VITE_FIREBASE_API_KEY não encontrado no .env');
  process.exit(2);
}

async function initAdmin() {
  const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
  const serviceAccount = JSON.parse(raw);
  try { (admin as any).initializeApp({ credential: (admin as any).cert(serviceAccount) }); } catch (e) { /* ignore */ }
  return getAuth();
}

async function exchangeCustomTokenForIdToken(customToken: string) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.idToken as string;
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg));base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buf: Buffer.from(match[3], 'base64') };
}

async function run(userId: string) {
  const auth = await initAdmin();
  const customToken = await auth.createCustomToken(userId);
  const idToken = await exchangeCustomTokenForIdToken(customToken);

  console.log('ID token obtido, chamando /api/whatsapp/connect ...');
  const connectRes = await fetch(`${SERVER_BASE}/api/whatsapp/connect`, {
    method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: '{}' ,
  });
  if (!connectRes.ok) {
    console.error('connect falhou:', connectRes.status, await connectRes.text());
    process.exit(3);
  }
  const connectJson = await connectRes.json();
  console.log('connect resposta:', connectJson);

  console.log('Aguardando QR... (até 60s)');
  const start = Date.now();
  let qrPayload: any = null;
  while (Date.now() - start < 60_000) {
    const qrRes = await fetch(`${SERVER_BASE}/api/whatsapp/qrcode`, {
      method: 'GET', headers: { Authorization: `Bearer ${idToken}` },
    });
    if (qrRes.ok) {
      const json = await qrRes.json();
      if (json?.qrCode) { qrPayload = json; break; }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!qrPayload) {
    console.error('QR não gerado dentro do tempo. Verifique logs do servidor.');
    process.exit(4);
  }

  console.log('QR encontrado. Salvando em tmp/whatsapp-qr.png (se for data URL)');
  const tmpDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dest = path.join(tmpDir, `whatsapp-qr-${userId}.png`);
  const dataUrl = qrPayload.qrCode as string;
  const converted = dataUrlToBuffer(dataUrl);
  if (converted) {
    fs.writeFileSync(dest, converted.buf);
    console.log('QR salvo em', dest);
  } else {
    // save raw text
    fs.writeFileSync(dest, Buffer.from(String(dataUrl)));
    console.log('QR salvo (raw) em', dest);
  }

  console.log('Imprima o QR ou abra o arquivo para escanear com o WhatsApp do celular.');
}

if (process.argv.length < 3) {
  console.error('Usage: node --import tsx scripts/connect-and-get-qr.ts <userId>');
  process.exit(2);
}

void run(process.argv[2]).catch((err) => { console.error('erro:', err); process.exit(1); });
