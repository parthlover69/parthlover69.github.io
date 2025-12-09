// =========================
// DM SYSTEM (FINAL VERSION)
// =========================

// REAL database connection
const dmdb = new FirebaseAPI("https://parthsocial-2f4bb-default-rtdb.firebaseio.com/")

let currentConversation = null

// Escape HTML
function escapeHtml(text) {
  if (!text) return ""
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Make sure user is logged in
function checkAuth() {
  const token = localStorage.getItem("authToken")
  const username = localStorage.getItem("username")
  if (!token || !username) {
    window.location.href = "index.html"
  }
}

// =========================
// Load User List
// =========================
async function loadUsers() {
  const users = await db.get("/users")
  const currentUser = localStorage.getItem("username")

  const select = document.getElementById("userSelect")
  select.innerHTML = `<option value="">Select user…</option>`

  if (!users) return

  Object.keys(users).forEach((username) => {
    if (username !== currentUser) {
      const option = document.createElement("option")
      option.value = username
      option.textContent = username
      select.appendChild(option)
    }
  })

  select.addEventListener("change", (e) => {
    if (e.target.value) {
      loadConversation(e.target.value)
    }
  })
}

// Generate deterministic 2-user conversation ID
function generateConversationId(user1, user2) {
  return [user1, user2].sort().join("_")
}

// =========================
// Load Conversation
// =========================
async function loadConversation(otherUser) {
  currentConversation = otherUser

  const currentUser = localStorage.getItem("username")
  const conversationId = generateConversationId(currentUser, otherUser)

  document.getElementById("threadHeader").innerHTML =
    `<h2>Chat with ${otherUser}</h2>`

  const messages = await db.get(`/dms/${conversationId}/messages`)
  const container = document.getElementById("messages")
  container.innerHTML = ""

  if (messages) {
    Object.entries(messages)
      .map(([, msg]) => msg)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach((msg) => {
        const div = document.createElement("div")
        div.className = `message ${msg.sender === currentUser ? "sent" : "received"}`
        const time = new Date(msg.createdAt).toLocaleTimeString()
        div.innerHTML = `
          ${escapeHtml(msg.text)}
          <div class="message-time">${time}</div>
        `
        container.appendChild(div)
      })
  }

  container.scrollTop = container.scrollHeight
}

// =========================
// Send Message
// =========================
document.getElementById("sendBtn").addEventListener("click", async () => {
  if (!currentConversation) return alert("Select a user first")

  const text = document.getElementById("messageText").value.trim()
  if (!text) return

  const currentUser = localStorage.getItem("username")
  const conversationId = generateConversationId(currentUser, currentConversation)

  const msg = {
    sender: currentUser,
    text,
    createdAt: new Date().toISOString(),
  }

  await db.push(`/dms/${conversationId}/messages`, msg)

  document.getElementById("messageText").value = ""
  loadConversation(currentConversation)
})

// =========================
// Auto-refresh every 3 sec
// =========================
setInterval(() => {
  if (currentConversation) {
    loadConversation(currentConversation)
  }
}, 3000)

// Startup
document.addEventListener("DOMContentLoaded", () => {
  checkAuth()
  loadUsers()
})
