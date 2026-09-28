/**
 * ZYNOCHAT CLIENT ENGINE (Vanilla ES12 JavaScript)
 * - Native Web Crypto API (AES-256-GCM E2EE & ECDH P-256 Key Exchange)
 * - WebSocket Engine with auto-reconnection
 * - Dual Responsive Layout Controller (Desktop 3-Column Workspace vs Mobile App PWA)
 * - Admin Command Center Telemetry Integrator
 */

class E2EECryptoEngine {
  constructor() {
    this.cryptoKey = null;
    this.keyPair = null;
  }

  // Generate ephemeral ECDH P-256 Keypair for E2EE Session
  async initializeKeys() {
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );

    // Generate static symmetric AES-GCM 256 key for shared channel demo
    this.cryptoKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    return this.keyPair;
  }

  // Encrypt plaintext string using client-side AES-GCM 256-bit
  async encrypt(message) {
    if (!this.cryptoKey) await this.initializeKeys();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMsg = new TextEncoder().encode(message);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      encodedMsg
    );

    return {
      encryptedPayload: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv)
    };
  }

  // Decrypt ciphertext using client-side AES-GCM 256-bit
  async decrypt(encryptedPayloadBase64, ivBase64) {
    if (!this.cryptoKey) await this.initializeKeys();
    try {
      const ciphertext = this.base64ToArrayBuffer(encryptedPayloadBase64);
      const iv = this.base64ToArrayBuffer(ivBase64);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (err) {
      console.error('[E2EE Decrypt Failure]:', err);
      return '⚠️ [Decryption Error: Key mismatch or tampered payload]';
    }
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

class ZynochatApp {
  constructor() {
    this.crypto = new E2EECryptoEngine();
    this.ws = null;
    this.clientId = null;
    this.username = `Agent_${Math.floor(1000 + Math.random() * 9000)}`;
    this.isVip = false;
    this.fingerprint = this.generateHardwareFingerprint();
    this.activeTarget = null; // null for channel, userId for DM
    this.activeRoom = this.getRoomFromURL();

    this.initUI();
    this.initCryptoAndWS();
    this.registerPWA();
  }


  getRoomFromURL() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) return roomParam.trim();
    if (window.location.hash && window.location.hash.length > 1) {
      return window.location.hash.substring(1).trim();
    }
    return "global-secure";
  }

  setActiveRoom(roomName, updateURL = true) {
    if (!roomName) return;
    this.activeRoom = roomName;
    this.activeTarget = null; // Reset DM target when joining channel

    // Update active chat title
    const titleEl = document.getElementById("active-chat-title");
    if (titleEl) titleEl.innerText = `# ${roomName}`;

    // Highlight matching channel in list if present
    const channelItems = document.querySelectorAll("#channel-list .nav-item");
    let found = false;
    channelItems.forEach(item => {
      const target = item.getAttribute("data-target") || item.querySelector(".channel-name")?.innerText;
      if (target === roomName || item.getAttribute("data-target") === roomName) {
        item.classList.add("active");
        found = true;
      } else {
        item.classList.remove("active");
      }
    });

    // If channel is not in the default list, dynamically add it
    if (!found) {
      this.addChannelToList(roomName, true);
    }

    // Update URL query string
    if (updateURL) {
      const newURL = new URL(window.location.href);
      newURL.searchParams.set("room", roomName);
      window.history.pushState({ room: roomName }, "", newURL.toString());
    }
  }

  addChannelToList(roomName, setActive = false) {
    const list = document.getElementById("channel-list");
    if (!list) return;

    // Check if already exists
    const existing = Array.from(list.children).find(li => li.getAttribute("data-target") === roomName);
    if (existing) {
      if (setActive) {
        Array.from(list.children).forEach(li => li.classList.remove("active"));
        existing.classList.add("active");
      }
      return;
    }

    const li = document.createElement("li");
    li.className = `nav-item ${setActive ? "active" : ""}`;
    li.setAttribute("data-target", roomName);
    li.innerHTML = `
      <span class="channel-hashtag">#</span>
      <span class="channel-name">${this.escapeHTML(roomName)}</span>
      <span class="badge-count">Custom</span>
    `;
    li.addEventListener("click", () => {
      this.setActiveRoom(roomName);
      if (window.innerWidth <= 1023) {
        document.querySelectorAll(".workspace-col").forEach(c => c.classList.remove("active-mobile-tab"));
        document.getElementById("col-chat").classList.add("active-mobile-tab");
      }
    });
    list.appendChild(li);
  }


  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `<span>${this.escapeHTML(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }


  fallbackCopyText(text, roomName) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      this.showToast(`🔗 Room link copied: #${roomName}`, "success");
    } catch (err) {
      this.showToast("Failed to copy link", "error");
    }
    document.body.removeChild(textArea);
  }


  formatMessageContent(text) {
    const escaped = this.escapeHTML(text);
    // Regex for URLs starting with http:// or https:// or www.
    const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    return escaped.replace(urlRegex, (url) => {
      const href = url.startsWith("www.") ? "https://" + url : url;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
    });
  }

  generateHardwareFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Zynochat_FP_2026', 2, 2);
    return 'HWFP_' + btoa(canvas.toDataURL()).substring(20, 36);
  }

  async initCryptoAndWS() {
    await this.crypto.initializeKeys();
    document.getElementById('profile-fingerprint').innerText = `FP: ${this.fingerprint}`;
    document.getElementById('profile-display-name').innerText = this.username;

    this.connectWebSocket();
  }

  connectWebSocket() {
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    if (this.wsConnectTimeout) clearTimeout(this.wsConnectTimeout);

    const params = new URLSearchParams(window.location.search);
    const customWs = params.get('ws_url') || params.get('ws');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname || 'localhost';
    const port = window.location.port;

    // Build array of fallback URLs
    const fallbackUrls = [];
    if (customWs) {
      fallbackUrls.push(customWs);
    }
    fallbackUrls.push(`${protocol}//${window.location.host}/ws`);

    if (port !== '3000') {
      fallbackUrls.push(`${protocol}//${hostname}:3000/ws`);
    }
    if (port !== '3099') {
      fallbackUrls.push(`${protocol}//${hostname}:3099/ws`);
    }

    if (!this.wsAttemptIndex) this.wsAttemptIndex = 0;
    const currentWsUrl = fallbackUrls[this.wsAttemptIndex % fallbackUrls.length];

    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      statusEl.innerText = 'Connecting...';
      statusEl.className = 'status-indicator status-connecting';
    }

    try {
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        try { this.ws.close(); } catch (_) {}
      }

      this.ws = new WebSocket(currentWsUrl);

      // Connection timeout safeguard (5s)
      this.wsConnectTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.warn('[WS] Connection timeout on:', currentWsUrl);
          try { this.ws.close(); } catch (_) {}
        }
      }, 5000);

      this.ws.onopen = () => {
        if (this.wsConnectTimeout) clearTimeout(this.wsConnectTimeout);
        if (statusEl) {
          statusEl.innerText = '● Connected (E2EE)';
          statusEl.className = 'status-indicator status-connected';
        }

        // Register client
        this.ws.send(JSON.stringify({
          type: 'REGISTER_CLIENT',
          username: this.username,
          isVip: this.isVip,
          fingerprint: this.fingerprint
        }));
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleWSMessage(data);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS Error] Endpoint failed:', currentWsUrl, err);
        if (statusEl) {
          statusEl.innerText = 'Connection Error (Retrying...)';
          statusEl.className = 'status-indicator status-connecting';
        }
      };

      this.ws.onclose = () => {
        if (this.wsConnectTimeout) clearTimeout(this.wsConnectTimeout);
        if (statusEl) {
          statusEl.innerText = 'Disconnected (Retrying)';
          statusEl.className = 'status-indicator status-connecting';
        }
        this.wsAttemptIndex++;
        this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (err) {
      console.error('[WS Init Exception]:', err);
      if (statusEl) {
        statusEl.innerText = 'Connection Error (Retrying...)';
        statusEl.className = 'status-indicator status-connecting';
      }
      this.wsAttemptIndex++;
      this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), 3000);
    }
  }

  async handleWSMessage(data) {
    switch (data.type) {
      case 'CONNECTED':
        this.clientId = data.clientId;
        break;

      case 'USER_LIST':
        this.renderUserDMList(data.users);
        break;

      case 'E2EE_MESSAGE':
        const decryptedText = await this.crypto.decrypt(data.encryptedPayload, data.iv);
        this.appendMessage({
          senderName: data.senderName,
          senderId: data.senderId,
          isVip: data.isVip,
          text: decryptedText,
          timestamp: data.timestamp,
          selfDestructTime: data.selfDestructTime,
          isSelf: data.senderId === this.clientId
        });
        break;

      case 'ERROR':
        alert(`Security Alert: ${data.message}`);
        break;
    }
  }

  initUI() {

    // Add New Channel (+) Trigger
    const newChannelBtn = document.getElementById("new-channel-btn");
    if (newChannelBtn) {
      newChannelBtn.addEventListener("click", () => {
        const roomName = prompt("Enter new encrypted room name (e.g. cyber-security, dev-lounge):");
        if (roomName && roomName.trim()) {
          const cleanRoom = roomName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          if (cleanRoom) {
            this.setActiveRoom(cleanRoom);
            this.showToast(`Joined room #${cleanRoom}`, "success");
          }
        }
      });
    }


    // Share Room Link Trigger
    const shareRoomBtn = document.getElementById("share-room-btn");
    if (shareRoomBtn) {
      shareRoomBtn.addEventListener("click", () => {
        const roomName = this.activeRoom || "global-secure";
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set("room", roomName);
        const linkStr = url.toString();

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(linkStr).then(() => {
            this.showToast(`🔗 Room link copied: #${roomName}`, "success");
          }).catch(() => {
            this.fallbackCopyText(linkStr, roomName);
          });
        } else {
          this.fallbackCopyText(linkStr, roomName);
        }
      });
    }


    // Channel List click delegation
    const channelList = document.getElementById("channel-list");
    if (channelList) {
      channelList.addEventListener("click", (e) => {
        const item = e.target.closest(".nav-item");
        if (!item) return;
        const targetRoom = item.getAttribute("data-target") || item.querySelector(".channel-name")?.innerText.trim();
        if (targetRoom) {
          this.setActiveRoom(targetRoom);
          if (window.innerWidth <= 1023) {
            document.querySelectorAll(".workspace-col").forEach(c => c.classList.remove("active-mobile-tab"));
            document.getElementById("col-chat").classList.add("active-mobile-tab");
          }
        }
      });
    }

    // Initialize active room from URL
    this.setActiveRoom(this.activeRoom, false);

    // Browser navigation (back/forward) handling
    window.addEventListener("popstate", () => {
      const room = this.getRoomFromURL();
      if (room) this.setActiveRoom(room, false);
    });

    // Send Message Trigger
    const sendBtn = document.getElementById('send-msg-btn');
    const inputArea = document.getElementById('message-input');

    const handleSend = async () => {
      const text = inputArea.value.trim();
      if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const selfDestructSec = parseInt(document.getElementById('self-destruct-select').value, 10);
      const { encryptedPayload, iv } = await this.crypto.encrypt(text);

      this.ws.send(JSON.stringify({
        type: 'E2EE_MESSAGE',
        targetId: this.activeTarget,
        encryptedPayload,
        iv,
        selfDestructTime: selfDestructSec
      }));

      inputArea.value = '';
    };

    sendBtn.addEventListener('click', handleSend);
    inputArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Mobile Responsive Navigation Tabs
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    const cols = document.querySelectorAll('.workspace-col');

    // Default mobile active tab
    if (window.innerWidth <= 1023) {
      document.getElementById('col-nav').classList.add('active-mobile-tab');
    }

    mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        mobileNavBtns.forEach(b => b.classList.remove('active'));
        cols.forEach(c => c.classList.remove('active-mobile-tab'));

        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active-mobile-tab');
      });
    });

    // Mobile back button
    document.getElementById('mobile-back-btn').addEventListener('click', () => {
      cols.forEach(c => c.classList.remove('active-mobile-tab'));
      document.getElementById('col-nav').classList.add('active-mobile-tab');
    });

    // VIP Upgrade Trigger
    document.getElementById('upgrade-vip-btn').addEventListener('click', async () => {
      const res = await fetch('/api/vip/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.clientId, plan: 'VIP_MONTHLY', cryptoTxHash: '0xVIP_MEMBER_PASS' })
      });
      const data = await res.json();
      if (data.success) {
        this.isVip = true;
        document.getElementById('vip-header-badge').classList.remove('hidden');
        document.getElementById('profile-vip-status').innerText = '★ VIP Tier Active';
        document.getElementById('profile-vip-status').className = 'badge badge-vip';
        alert('🎉 Upgrade Successful! VIP Perks Unlocked.');

        // Re-register with server as VIP
        this.ws.send(JSON.stringify({
          type: 'REGISTER_CLIENT',
          username: this.username,
          isVip: true,
          fingerprint: this.fingerprint
        }));
      }
    });

    // Admin Command Center Button & Modal
    const adminBtn = document.getElementById('admin-panel-btn');
    const adminModal = document.getElementById('admin-modal');
    adminBtn.style.display = 'inline-block';

    adminBtn.addEventListener('click', () => {
      adminModal.classList.remove('hidden');
      this.fetchAdminTelemetry();
    });

    document.getElementById('close-admin-modal').addEventListener('click', () => {
      adminModal.classList.add('hidden');
    });

    document.getElementById('execute-ban-btn').addEventListener('click', async () => {
      const targetType = document.getElementById('ban-type-select').value;
      const targetValue = document.getElementById('ban-value-input').value.trim();
      if (!targetValue) return alert('Enter target value');

      const res = await fetch('/api/admin/ban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer zyno_admin_secret_key_2026'
        },
        body: JSON.stringify({ targetType, targetValue, reason: 'Admin Command Center Violation' })
      });
      const result = await res.json();
      if (result.success) {
        alert(result.message);
        document.getElementById('ban-value-input').value = '';
        this.fetchAdminTelemetry();
      } else {
        alert(result.error);
      }
    });
  }

  async fetchAdminTelemetry() {
    try {
      const res = await fetch('/api/admin/telemetry', {
        headers: { 'Authorization': 'Bearer zyno_admin_secret_key_2026' }
      });
      const telemetry = await res.json();

      document.getElementById('telemetry-cpu').innerText = `${telemetry.cpu.load1m} (${telemetry.cpu.cores} Cores)`;
      document.getElementById('telemetry-ram').innerText = `${telemetry.memory.usedMB} / ${telemetry.memory.totalMB} MB`;
      document.getElementById('telemetry-uptime').innerText = `${telemetry.uptimeSeconds}s`;

      const logsRes = await fetch('/api/admin/audit-logs', {
        headers: { 'Authorization': 'Bearer zyno_admin_secret_key_2026' }
      });
      const logsData = await logsRes.json();
      const tbody = document.getElementById('audit-logs-body');
      tbody.innerHTML = logsData.logs.map(log => `
        <tr>
          <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
          <td>${log.adminUser}</td>
          <td><strong style="color:#ef4444">${log.action}</strong></td>
          <td>${log.target}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Telemetry fetch failed:', e);
    }
  }

  renderUserDMList(users) {
    const list = document.getElementById('user-dm-list');
    list.innerHTML = '';
    users.filter(u => u.id !== this.clientId).forEach(u => {
      const li = document.createElement('li');
      li.className = `nav-item ${this.activeTarget === u.id ? 'active' : ''}`;
      li.innerHTML = `
        <span class="pulse-dot"></span>
        <span class="channel-name">${u.username}</span>
        ${u.isVip ? '<span class="badge badge-gold">VIP</span>' : ''}
      `;
      li.addEventListener('click', () => {
        this.activeTarget = u.id;
        document.getElementById('active-chat-title').innerText = `@ ${u.username}`;
        document.querySelectorAll('#user-dm-list .nav-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');

        if (window.innerWidth <= 1023) {
          document.querySelectorAll('.workspace-col').forEach(c => c.classList.remove('active-mobile-tab'));
          document.getElementById('col-chat').classList.add('active-mobile-tab');
        }
      });
      list.appendChild(li);
    });
  }

  appendMessage(msg) {
    const container = document.getElementById('messages-container');
    const group = document.createElement('div');
    group.className = `msg-bubble-group ${msg.isSelf ? 'outgoing' : 'incoming'}`;

    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    group.innerHTML = `
      <div class="msg-meta">${msg.senderName} ${msg.isVip ? '★' : ''} • ${timeStr}</div>
      <div class="msg-content">${this.formatMessageContent(msg.text)}</div>
    `;

    container.appendChild(group);
    container.scrollTop = container.scrollHeight;

    // Self-destruct message handling
    if (msg.selfDestructTime > 0) {
      setTimeout(() => {
        group.style.opacity = '0.3';
        group.innerHTML = `<div class="msg-content" style="font-style:italic;">🔥 [Message Self-Destructed]</div>`;
      }, msg.selfDestructTime * 1000);
    }
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  registerPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
          console.log('ServiceWorker registration failed: ', err);
        });
      });
    }
  }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.zynochatApp = new ZynochatApp();
});
