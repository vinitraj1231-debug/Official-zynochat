const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { router: adminRouter, bannedIPs, bannedFingerprints, bannedUsers } = require("./admin");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "zynochat_e2ee_jwt_super_secret_key_2026";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/
app.use(express.static(path.join(__dirname, "../public")));

// Admin API Mount
app.use("/api/admin", adminRouter);

// --- MODULE 1: SEO, AEO & GEO DYNAMIC SSR ROUTES ---

// Dynamic Sitemap Endpoint
app.get("/sitemap.xml", (req, res) => {
  res.header("Content-Type", "application/xml");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://elitehosting.in/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>
  <url><loc>https://elitehosting.in/features</loc><priority>0.8</priority><changefreq>weekly</changefreq></url>
  <url><loc>https://elitehosting.in/security</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>
  <url><loc>https://elitehosting.in/vip</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>
  <url><loc>https://elitehosting.in/faq</loc><priority>0.8</priority><changefreq>monthly</changefreq></url>
</urlset>`;
  res.send(xml);
});

// Dynamic Robots.txt Endpoint
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/admin/\nSitemap: https://elitehosting.in/sitemap.xml`);
});

// SSR Landing Page Generator reading base template
function renderSSRPage(title, description, pageSlug = "") {
  try {
    const templatePath = path.join(__dirname, "../public/index.html");
    let indexHtml = fs.readFileSync(templatePath, "utf8");
    if (title) {
      indexHtml = indexHtml.replace(/<title>.*?<\/title>/i, "<title>" + title + " | Zynochat - Ultra-Secure E2EE Workspace</title>");
    }
    if (description) {
      indexHtml = indexHtml.replace(/<meta name="description" content=".*?"/i, `<meta name="description" content="${description}"`);
    }
    return indexHtml;
  } catch (err) {
    return "<html><body><h1>Zynochat</h1></body></html>";
  }
}

app.get("/features", (req, res) => {
  res.send(renderSSRPage("Features & Security", "Explore AES-GCM 256 E2EE, PWA support, and glassmorphic workspace features on Zynochat.", "features"));
});

app.get("/vip", (req, res) => {
  res.send(renderSSRPage("Zynochat VIP Tier", "Upgrade to VIP for high-bandwidth file sharing, priority WebSockets, and exclusive badging.", "vip"));
});

// App Root SSR Entry point
app.get("*", (req, res) => {
  res.send(renderSSRPage("E2EE Real-Time Workspace", "Ultra-secure E2EE messaging platform on elitehosting.in.", ""));
});

// --- MODULE 5: MONETIZATION & VIP WEBHOOK GATEWAY ---
app.post("/api/vip/webhook", (req, res) => {
  const { userId, plan, token, cryptoTxHash } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  console.log(`[VIP MONETIZATION] Upgrading User ${userId} to VIP (Tx: ${cryptoTxHash || "Standard-Card"})`);
  res.json({
    success: true,
    userId,
    vipStatus: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    perks: ["Priority WebSockets", "VIP Badge", "100MB E2EE File Uploads", "Self-Destruct Messages"]
  });
});

// --- HTTP SERVER & WEBSOCKET ENGINE ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

const clients = new Map();

wss.on("connection", (ws, req) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (bannedIPs.has(clientIp)) {
    ws.send(JSON.stringify({ type: "ERROR", message: "Your IP is banned from Zynochat" }));
    return ws.close();
  }

  const clientId = `usr_${Math.random().toString(36).substring(2, 9)}`;
  clients.set(ws, { id: clientId, username: "Anonymous", isVip: false, ip: clientIp, fingerprint: null });

  ws.send(JSON.stringify({
    type: "CONNECTED",
    clientId,
    serverTime: new Date().toISOString(),
    domain: "elitehosting.in"
  }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const clientInfo = clients.get(ws);

      if (clientInfo && ((clientInfo.fingerprint && bannedFingerprints.has(clientInfo.fingerprint)) || bannedUsers.has(clientInfo.id))) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Account or Hardware banned" }));
        return ws.close();
      }

      switch (msg.type) {
        case "REGISTER_CLIENT":
          clientInfo.username = msg.username || "Agent";
          clientInfo.isVip = !!msg.isVip;
          clientInfo.fingerprint = msg.fingerprint || null;
          ws.send(JSON.stringify({ type: "REGISTERED", id: clientInfo.id, isVip: clientInfo.isVip }));
          broadcastUserList();
          break;

        case "E2EE_SIGNAL":
        case "E2EE_MESSAGE":
          broadcastMessage(ws, {
            type: msg.type,
            senderId: clientInfo.id,
            senderName: clientInfo.username,
            isVip: clientInfo.isVip,
            targetId: msg.targetId,
            encryptedPayload: msg.encryptedPayload,
            iv: msg.iv,
            selfDestructTime: msg.selfDestructTime || 0,
            timestamp: new Date().toISOString()
          });
          break;

        case "PING":
          ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
          break;
      }
    } catch (err) {
      console.error("Invalid WS frame:", err.message);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcastUserList();
  });
});

function broadcastMessage(senderWs, payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      if (!payload.targetId || payload.targetId === clients.get(client)?.id || client === senderWs) {
        client.send(JSON.stringify(payload));
      }
    }
  });
}

function broadcastUserList() {
  const userList = Array.from(clients.values()).map(c => ({
    id: c.id,
    username: c.username,
    isVip: c.isVip
  }));
  const payload = JSON.stringify({ type: "USER_LIST", users: userList });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Zynochat Production Engine] Running on http://localhost:${PORT}`);
  });
}

module.exports = { app, server, wss };
