import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null, onmessageerror: null, closed: false };
    this.port2 = { onmessage: null, onmessageerror: null, closed: false };
    this.port1.postMessage = (data) => queueMicrotask(() => this.port2.onmessage?.({ data }));
    this.port2.postMessage = (data) => queueMicrotask(() => this.port1.onmessage?.({ data }));
    this.port1.close = () => { this.port1.closed = true; };
    this.port2.close = () => { this.port2.closed = true; };
  }
}

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const createWorker = (peers) => {
  const listeners = new Map();
  const self = {
    location: { origin: 'https://motofix.example' },
    clients: { matchAll: async (options) => {
      assert.equal(options.type, 'window');
      assert.equal(options.includeUncontrolled, true);
      return peers;
    } },
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  vm.runInNewContext(source, {
    self, URL, MessageChannel: TestMessageChannel, setTimeout, clearTimeout,
    fetch: () => { throw new Error('The peer protocol test must not perform network requests.'); },
    console,
  });
  return listeners.get('message');
};

const probe = async (handler) => {
  const channel = new MessageChannel();
  const result = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Service Worker did not finish peer probe.')), 3000);
    channel.port1.onmessage = (event) => { clearTimeout(timeout); resolve(event.data); };
  });
  let task;
  handler({
    data: { type: 'motofix:backup-peer-audit', requestId: 'fixture', protocolVersion: 1 },
    ports: [channel.port2],
    source: { id: 'requester' },
    waitUntil: (value) => { task = value; },
  });
  const response = await result;
  await task;
  channel.port1.close();
  return response;
};

test('Service Worker confirma todas as abas somente quando cada cliente oferece o protocolo atual', async () => {
  const peer = (id, ok = true, protocolVersion = 1) => ({
    id,
    postMessage: (message, ports) => {
      assert.equal(message.type, 'motofix:backup-peer-audit');
      ports[0].postMessage({ ok, protocolVersion });
      ports[0].close();
    },
  });
  const successful = await probe(createWorker([peer('tab-a'), peer('tab-b')]));
  assert.equal(successful.ok, true);

  const stale = await probe(createWorker([peer('tab-a'), peer('tab-old', false, 0)]));
  assert.equal(stale.ok, false, 'Uma aba antiga não pode ser ignorada durante o backup.');
  assert.match(stale.message, /abas abertas/i);
});
