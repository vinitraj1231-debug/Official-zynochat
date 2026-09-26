const http = require('http');
const assert = require('assert');
const WebSocket = require('ws');
const { app, server } = require('../server/server');

const PORT = 3099;

async function runTests() {
  console.log('=== Starting Zynochat Verification Tests ===');

  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}`);

  try {
    // Test 1: SSR Route
    const res1 = await fetch(`http://localhost:${PORT}/`);
    assert.strictEqual(res1.status, 200);
    const html = await res1.text();
    assert.ok(html.includes('Zynochat'));
    assert.ok(html.includes('SoftwareApplication'));
    console.log('✓ Test 1 Passed: Dynamic SSR & JSON-LD Schemas');

    // Test 2: Sitemap XML
    const res2 = await fetch(`http://localhost:${PORT}/sitemap.xml`);
    assert.strictEqual(res2.status, 200);
    const xml = await res2.text();
    assert.ok(xml.includes('https://elitehosting.in/'));
    console.log('✓ Test 2 Passed: Dynamic Sitemap Generator');

    // Test 3: Robots.txt
    const res3 = await fetch(`http://localhost:${PORT}/robots.txt`);
    assert.strictEqual(res3.status, 200);
    const txt = await res3.text();
    assert.ok(txt.includes('Disallow: /api/admin/'));
    console.log('✓ Test 3 Passed: Robots.txt Search Policy');

    // Test 4: VIP Payment Webhook
    const res4 = await fetch(`http://localhost:${PORT}/api/vip/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr_test123', plan: 'VIP_MONTHLY', cryptoTxHash: '0x123' })
    });
    assert.strictEqual(res4.status, 200);
    const vipData = await res4.json();
    assert.strictEqual(vipData.success, true);
    assert.strictEqual(vipData.vipStatus, true);
    console.log('✓ Test 4 Passed: VIP Monetization Gateway');

    // Test 5: Admin Telemetry
    const unauthRes = await fetch(`http://localhost:${PORT}/api/admin/telemetry`);
    assert.strictEqual(unauthRes.status, 403);

    const authRes = await fetch(`http://localhost:${PORT}/api/admin/telemetry`, {
      headers: { 'Authorization': 'Bearer zyno_admin_secret_key_2026' }
    });
    assert.strictEqual(authRes.status, 200);
    const telData = await authRes.json();
    assert.strictEqual(telData.status, 'online');
    assert.ok(telData.cpu);
    console.log('✓ Test 5 Passed: Admin Telemetry & Zero Trust Access');

    // Test 6: WebSocket Relay
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'REGISTER_CLIENT',
          username: 'Tester',
          isVip: true,
          fingerprint: 'HWFP_TEST'
        }));
      });

      ws.on('message', (dataStr) => {
        const msg = JSON.parse(dataStr.toString());
        if (msg.type === 'REGISTERED') {
          ws.send(JSON.stringify({
            type: 'E2EE_MESSAGE',
            encryptedPayload: 'TEST_PAYLOAD',
            iv: 'TEST_IV'
          }));
        } else if (msg.type === 'E2EE_MESSAGE') {
          assert.strictEqual(msg.encryptedPayload, 'TEST_PAYLOAD');
          ws.close();
          console.log('✓ Test 6 Passed: WebSocket Zero-Knowledge Frame Relay');
          resolve();
        }
      });
      ws.on('error', reject);
    });

    console.log('\nALL 6 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
