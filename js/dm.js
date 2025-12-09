// =========================
// DM SYSTEM — Optimized (Full Functionality Preserved)
// =========================

(function () {
  const localDb =
    window.db ||
    window.dmdb ||
    new FirebaseAPI("https://parthsocial-2f4bb-default-rtdb.firebaseio.com/");

  let currentConversation = null;
  let _loadingConversation = false;

  const escapeHtml = (t) =>
    t
      ? t
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;")
      : "";

  const messagesToArray = (n) =>
    !n
      ? []
      : Array.isArray(n)
      ? n.filter(Boolean)
      : Object.values(n).filter(Boolean);

  const generateConversationId = (a, b) =>
    [a, b].sort().join("_");

  function checkAuth() {
    if (!localStorage.getItem("authToken") || !localStorage.getItem("username"))
      location.href = "index.html";
  }

  // =========================
  // LOAD RECENT CONVERSATIONS (Optimized)
  // =========================
  async function loadRecentConversations() {
    try {
      const user = localStorage.getItem("username");
      const [users, dms] = await Promise.all([
        localDb.get("/users"),
        localDb.get("/dms"),
      ]);

      const container = document.getElementById("conversationList");
      if (!container || !dms) return;
      container.innerHTML = "";

      const conversations = [];

      for (const convoId in dms) {
        if (!convoId.includes(user)) continue;
        const convoNode = dms[convoId];
        if (!convoNode) continue;

        const msgs = messagesToArray(convoNode.messages || convoNode);
        if (!msgs.length) continue;

        // last message
        let lastMsg = msgs[0];
        for (let i = 1; i < msgs.length; i++) {
          if (
            new Date(msgs[i].createdAt) >
            new Date(lastMsg.createdAt)
          )
            lastMsg = msgs[i];
        }

        const [u1, u2] = convoId.split("_");
        const otherUser = u1 === user ? u2 : u1;

        conversations.push({
          otherUser,
          lastMsg,
          unread: lastMsg.sender !== user,
        });
      }

      conversations.sort(
        (a, b) =>
          new Date(b.lastMsg.createdAt) -
          new Date(a.lastMsg.createdAt)
      );

      for (const convo of conversations) {
        const el = document.createElement("div");
        el.className = "conversation-item";
        el.innerHTML = `
          <span class="conversation-name">${escapeHtml(
            convo.otherUser
          )}</span>
          ${convo.unread ? `<span class="unread-dot"></span>` : ""}
        `;
        el.onclick = () => loadConversation(convo.otherUser);
        container.appendChild(el);
      }
    } catch (err) {
      console.error("loadRecentConversations error:", err);
    }
  }

  // =========================
  // LOAD USERS (optimized)
  // =========================
  async function loadUsers() {
    try {
      const users = await localDb.get("/users");
      const currentUser = localStorage.getItem("username");
      const select = document.getElementById("userSelect");
      if (!select || !users) return;

      select.innerHTML = `<option value="">Select user…</option>`;
      for (const u in users) {
        if (u === currentUser) continue;
        const o = document.createElement("option");
        o.value = o.textContent = u;
        select.appendChild(o);
      }

      select.onchange = (e) =>
        e.target.value && loadConversation(e.target.value);
    } catch (err) {
      console.error("loadUsers error:", err);
    }
  }

  // =========================
  // LOAD CONVERSATION (optimized, same behavior)
  // =========================
  async function loadConversation(otherUser) {
    if (_loadingConversation && currentConversation === otherUser) return;
    _loadingConversation = true;

    try {
      const currentUser = localStorage.getItem("username");
      currentConversation = otherUser;
      const convoId = generateConversationId(currentUser, otherUser);

      const header = document.getElementById("threadHeader");
      if (header)
        header.innerHTML = `<h2>Chat with ${escapeHtml(otherUser)}</h2>`;

      let messages = await localDb.get(`/dms/${convoId}/messages`);
      if (!messages) {
        const node = await localDb.get(`/dms/${convoId}`);
        messages = node?.messages || null;
      }

      const container = document.getElementById("messages");
      if (!container) return;
      container.innerHTML = "";

      if (messages) {
        let arr = messagesToArray(messages);

        // fastest ascending sort
        arr.sort(
          (a, b) =>
            new Date(a.createdAt) - new Date(b.createdAt)
        );

        for (const msg of arr) {
          const d = document.createElement("div");
          d.className =
            "message " +
            (msg.sender === currentUser ? "sent" : "received");
          const time = msg.createdAt
            ? new Date(msg.createdAt).toLocaleTimeString()
            : "";
          d.innerHTML = `
            ${escapeHtml(msg.text)}
            <div class="message-time">${time}</div>
          `;
          container.appendChild(d);
        }
      } else {
        container.innerHTML = `<div class="empty-thread">No messages yet — say hi!</div>`;
      }

      container.scrollTop = container.scrollHeight;
      loadRecentConversations();
    } catch (err) {
      console.error("loadConversation error:", err);
    } finally {
      _loadingConversation = false;
    }
  }

  // =========================
  // SEND MESSAGE (optimized)
  // =========================
  function initSendHandler() {
    const sendBtn = document.getElementById("sendBtn");
    if (!sendBtn) return;

    sendBtn.onclick = null;

    sendBtn.addEventListener("click", async () => {
      if (!currentConversation) return alert("Select a user first");

      const textEl = document.getElementById("messageText");
      const text = textEl?.value.trim();
      if (!text) return;

      try {
        const user = localStorage.getItem("username");
        const convoId = generateConversationId(user, currentConversation);
        const msg = {
          sender: user,
          text,
          createdAt: new Date().toISOString(),
        };

        await localDb.push(`/dms/${convoId}/messages`, msg);

        textEl.value = "";
        loadConversation(currentConversation);
      } catch (err) {
        console.error("send error:", err);
      }
    });
  }

  // =========================
  // AUTO-REFRESH (optimized polling)
  // =========================
  setInterval(() => {
    try {
      loadRecentConversations();
      if (currentConversation && !_loadingConversation)
        loadConversation(currentConversation);
    } catch (e) {
      console.debug("poll error:", e);
    }
  }, 3000);

  // =========================
  // INIT
  // =========================
  document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    loadRecentConversations();
    loadUsers();
    initSendHandler();
  });
})();
