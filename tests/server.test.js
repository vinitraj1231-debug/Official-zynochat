const test = require('node.test');
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const { app, server } = require('../server/server');

const TEST_PORT = 3099;

test.before((done) => {
  server.listen(TEST_PORT, () => {
    done();
  });
});

test.after((done) => {
  server.close(() => {
    done();
  });
});

test('HTTP GET / - Dynamic SSR HTML Response with SEO/GEO schema', async () => {
  const res = await fetch(`http://localhost:${TEST_PORT}/`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.match(text, /Zynochat/);
  assert.match(text, /application\/ld\+json/);
  assert.match(text, /FAQPage/);
  assert.match(text, /SoftwareApplication/);
});

test('HTTP GET /sitemap.xml - Dynamic XML Sitemap', async () => {
  const res = await fetch(`http://localhost:${TEST_PORT}/sitemap.xml`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/xml; charset=utf-8');
  const text = await res.text();
  assert.match(text, /<loc>https:\/\/elitehosting\.in\/<\/loc>/);
});

test('HTTP GET /robots.txt - Search engine crawl rules', async () => {
  const res = await fetch(`http://localhost:${TEST_PORT}/robots.txt`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.match(text, /Disallow: \/api\/admin\//);
});

test('HTTP POST /api/vip/webhook - VIP Upgrade Bridge', async () => {
  const res = await fetch(`http://localhost:${TEST_PORT}/api/vip/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'usr_test123', plan: 'VIP_MONTHLY', cryptoTxHash: '0x123' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.vipStatus, true);
});

test('HTTP GET /api/admin/telemetry - Admin Telemetry Protection', async () => {
  // Unauthorized request
  const unauthRes = await fetch(`http://localhost:${TEST_PORT}/api/admin/telemetry`);
  assert.strictEqual(unauthRes.status, 403);

  // Authorized request
  const authRes = await fetch(`http://localhost:${TEST_PORT}/api/admin/telemetry`, {
    headers: { 'Authorization': 'Bearer zyno_admin_secret_key_2026' }
  });
  assert.strictEqual(authRes.status, 200);
  const data = await authRes.json();
  assert.strictEqual(data.status, 'online');
  assert.ok(data.cpu);
  assert.ok(data.memory);
});

test('WebSocket /ws - Real-Time E2EE Frame Relay', (t, done) => {
  const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'REGISTER_CLIENT',
      username: 'TestAgent',
      isVip: true,
      fingerprint: 'HWFP_TEST'
    }));
  });

  ws.on('message', (msgStr) => {
    const msg = JSON.parse(msgStr.toString());
    if (msg.type === 'CONNECTED') {
      assert.ok(msg.clientId);
    } else if (msg.type === 'REGISTERED') {
      assert.strictEqual(msg.isVip, true);

      // Send encrypted message frame
      ws.send(JSON.stringify({
        type: 'E2EE_MESSAGE',
        encryptedPayload: 'SGVsbG8gV29ybGQ=',
        iv: 'MTIzNDU2Nzg5MDEy',
        selfDestructTime: 10
      }));
    } else if (msg.type === 'E2EE_MESSAGE') {
      assert.strictEqual(msg.encryptedPayload, 'SGVsbG8gV29ybGQ=');
      ws.close();
      done();
    }
  });
});
