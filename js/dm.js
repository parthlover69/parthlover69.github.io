// =========================
// DM SYSTEM — Ultra-Optimized, All Features Preserved
// =========================
(() => {
  const db =
    window.db ||
    window.dmdb ||
    new FirebaseAPI("https://parthsocialhack-default-rtdb.firebaseio.com/");

  let currentConvo = null,
    loading = false;

  const esc = (t) =>
    t
      ? t.replace(/[&<>"']/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
            c
          ])
        )
      : "";

  const toArray = (n) =>
    !n ? [] : Array.isArray(n) ? n.filter(Boolean) : Object.values(n).filter(Boolean);

  const convoId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  const unreadDot = (u, show) => {
    const el = document.querySelector(
      `.conversation-item[data-id="${CSS.escape(u)}"] .unread-dot`
    );
    if (el) el.style.display = show ? "inline-block" : "none";
  };

  const authCheck = () => {
    if (!localStorage.authToken || !localStorage.username)
      location.href = "index.html";
  };

  // =========================
  // LOAD RECENT CONVERSATIONS
  // =========================
  async function loadRecents() {
    try {
      const user = localStorage.username;
      const container = document.getElementById("conversationList");
      if (!container) return;

      const [users, dms] = await Promise.all([
        db.get("/users"),
        db.get("/dms"),
      ]);
      if (!dms) return;

      container.innerHTML = "";
      const rows = [];

      for (const id in dms) {
        if (!id.includes(user)) continue;

        const node = dms[id];
        if (!node) continue;

        const msgs = toArray(node.messages || node);
        if (!msgs.length) continue;

        // get last message FASTEST possible
        let last = msgs[0];
        for (let i = 1; i < msgs.length; i++)
          if (msgs[i].createdAt > last.createdAt) last = msgs[i];

        const [a, b] = id.split("_");
        const other = a === user ? b : a;

        rows.push({
          other,
          last,
          unread: last.sender !== user,
        });
      }

      rows.sort(
        (a, b) => (b.last.createdAt > a.last.createdAt ? 1 : -1)
      );

      for (const r of rows) {
        const el = document.createElement("div");
        el.className = "conversation-item";
        el.dataset.id = r.other;

        el.innerHTML = `
          <span class="conversation-name">
            ${esc(r.other)}
            <span class="unread-dot" style="display:${
              r.unread ? "inline-block" : "none"
            }"></span>
          </span>
        `;

        el.onclick = () => loadConvo(r.other);
        container.appendChild(el);
      }
    } catch (err) {
      console.error("loadRecents error:", err);
    }
  }

  // =========================
  // LOAD USERS
  // =========================
  async function loadUsers() {
    try {
      const users = await db.get("/users");
      const me = localStorage.username;
      const s = document.getElementById("userSelect");

      if (!users || !s) return;

      s.innerHTML = `<option value="">Select a user…</option>`;
      for (const u in users) {
        if (u === me) continue;
        s.innerHTML += `<option value="${esc(u)}">${esc(u)}</option>`;
      }

      s.onchange = (e) => e.target.value && loadConvo(e.target.value);
    } catch (e) {
      console.error("loadUsers error:", e);
    }
  }

  // =========================
  // LOAD CONVERSATION
  // =========================
  async function loadConvo(other) {
    if (loading && currentConvo === other) return;
    loading = true;

    try {
      const me = localStorage.username;
      currentConvo = other;

      unreadDot(other, false);

      const id = convoId(me, other);

      const head = document.getElementById("threadHeader");
      if (head) head.innerHTML = `<h2>Chat with ${esc(other)}</h2>`;

      let msgs = await db.get(`/dms/${id}/messages`);
      if (!msgs) msgs = (await db.get(`/dms/${id}`))?.messages;

      const box = document.getElementById("messages");
      if (!box) return;

      box.innerHTML = "";

      if (msgs) {
        const arr = toArray(msgs).sort(
          (a, b) => (a.createdAt > b.createdAt ? 1 : -1)
        );

        let html = "";
        for (const m of arr) {
          html += `
            <div class="message ${m.sender === me ? "sent" : "received"}">
              ${esc(m.text)}
              <div class="message-time">${
                m.createdAt
                  ? new Date(m.createdAt).toLocaleTimeString()
                  : ""
              }</div>
            </div>`;
        }
        box.innerHTML = html;
      } else {
        box.innerHTML = `<div class="empty-thread">No messages yet — say hi!</div>`;
      }

      box.scrollTop = box.scrollHeight;
      loadRecents();
    } catch (e) {
      console.error("loadConvo error:", e);
    } finally {
      loading = false;
    }
  }

  // Allow sending message with Enter key
const textEl = document.getElementById("messageText");
if (textEl) {
  textEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click(); // Trigger the same send logic
    }
  });
}



  // =========================
  // SEND MESSAGE
  // =========================
  function initSendHandler() {
    const sendBtn = document.getElementById("sendBtn");
    if (!sendBtn) return;
  
    sendBtn.onclick = null;
  
    // --- SEND ON ENTER KEY ---
    const textEl = document.getElementById("messageText");
    if (textEl) {
      textEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }
    // -------------------------
  
    sendBtn.addEventListener("click", async () => {
      if (!currentConversation) return alert("Select a user first");
  
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
  // AUTO REFRESH (still 3 sec)
  // =========================
  setInterval(() => {
    loadRecents();
    if (currentConvo && !loading) loadConvo(currentConvo);
  }, 3000);

  // =========================
  // INIT
  // =========================
  document.addEventListener("DOMContentLoaded", () => {
    authCheck();
    loadRecents();
    loadUsers();
    initSend();
  });
})();
