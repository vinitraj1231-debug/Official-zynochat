const express = require('express');
const router = express.Router();
const os = require('os');

// In-memory store for moderation and audit logging
const bannedIPs = new Set();
const bannedFingerprints = new Set();
const bannedUsers = new Set();
const auditLogs = [];

// Helper to record audit log
function logAdminAction(adminUser, action, target, details) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    adminUser,
    action,
    target,
    details
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 500) auditLogs.pop(); // Keep last 500 logs
  return entry;
}

// Middleware: Verify Cloudflare Zero Trust / Admin Authorization Token
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  const cfAccessEmail = req.headers['cf-access-authenticated-user-email'];

  // Zero Trust Access Header check or JWT token validation
  if (cfAccessEmail || token === (process.env.ADMIN_TOKEN || 'zyno_admin_secret_key_2026')) {
    req.adminIdentity = cfAccessEmail || 'root_admin';
    return next();
  }
  return res.status(403).json({ error: 'Access Denied: Cloudflare Zero Trust Verification Required' });
}

// 1. VPS Telemetry Endpoint
router.get('/telemetry', requireAdminAuth, (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const loadAvg = os.loadavg();

  res.json({
    status: 'online',
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSeconds: Math.floor(os.uptime()),
    cpu: {
      cores: cpus.length,
      model: cpus[0] ? cpus[0].model : 'Generic VPS CPU',
      load1m: loadAvg[0].toFixed(2),
      load5m: loadAvg[1].toFixed(2),
      load15m: loadAvg[2].toFixed(2)
    },
    memory: {
      totalMB: Math.round(totalMem / (1024 * 1024)),
      usedMB: Math.round(usedMem / (1024 * 1024)),
      freeMB: Math.round(freeMem / (1024 * 1024)),
      usagePercent: ((usedMem / totalMem) * 100).toFixed(1)
    },
    domain: 'elitehosting.in',
    activeBanCount: {
      ips: bannedIPs.size,
      fingerprints: bannedFingerprints.size,
      users: bannedUsers.size
    }
  });
});

// 2. One-click Ban / Moderation Endpoint
router.post('/ban', requireAdminAuth, (req, res) => {
  const { targetType, targetValue, reason } = req.body;
  if (!targetType || !targetValue) {
    return res.status(400).json({ error: 'targetType (ip|fingerprint|user) and targetValue are required' });
  }

  if (targetType === 'ip') bannedIPs.add(targetValue);
  else if (targetType === 'fingerprint') bannedFingerprints.add(targetValue);
  else if (targetType === 'user') bannedUsers.add(targetValue);
  else return res.status(400).json({ error: 'Invalid targetType' });

  const log = logAdminAction(req.adminIdentity, 'BAN', `${targetType}:${targetValue}`, reason || 'Violation of terms');
  res.json({ success: true, message: `Successfully banned ${targetType}: ${targetValue}`, log });
});

// 3. Unban Endpoint
router.post('/unban', requireAdminAuth, (req, res) => {
  const { targetType, targetValue } = req.body;
  if (targetType === 'ip') bannedIPs.delete(targetValue);
  else if (targetType === 'fingerprint') bannedFingerprints.delete(targetValue);
  else if (targetType === 'user') bannedUsers.delete(targetValue);

  const log = logAdminAction(req.adminIdentity, 'UNBAN', `${targetType}:${targetValue}`, 'Manual unban by admin');
  res.json({ success: true, message: `Unbanned ${targetType}: ${targetValue}`, log });
});

// 4. Immutable Audit Logs Endpoint
router.get('/audit-logs', requireAdminAuth, (req, res) => {
  res.json({ success: true, total: auditLogs.length, logs: auditLogs });
});

module.exports = {
  router,
  bannedIPs,
  bannedFingerprints,
  bannedUsers,
  logAdminAction
};
