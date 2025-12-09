// ======================================
// PRIVATE GROUP CHAT SYSTEM
// ======================================

// Real Firebase connection
const groupdb = new FirebaseAPI("https://parthsocial-2f4bb-default-rtdb.firebaseio.com/")

let currentGroup = null

// ======================================
// AUTH CHECK
// ======================================
function checkAuth() {
  const token = localStorage.getItem("authToken")
  const username = localStorage.getItem("username")
  if (!token || !username) {
    window.location.href = "index.html"
  }
}

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

// ======================================
// LOAD GROUPS — only groups the user is a member of
// ======================================
async function loadGroups() {
  const username = localStorage.getItem("username")
  const groups = await groupdb.get("/groups")

  const groupsList = document.getElementById("groupsList")
  groupsList.innerHTML = ""

  if (!groups) return

  Object.keys(groups).forEach((groupName) => {
    const grp = groups[groupName]

    // Only show groups where user is a member
    if (!grp.members || !grp.members[username]) return

    const item = document.createElement("div")
    item.className = "group-item"
    item.textContent = groupName

    item.addEventListener("click", () => {
      document.querySelectorAll(".group-item").forEach((i) => i.classList.remove("active"))
      item.classList.add("active")
      enterGroup(groupName)
    })

    groupsList.appendChild(item)
  })
}

// ======================================
// ENTER GROUP — requires membership
// ======================================
async function enterGroup(groupName) {
  const username = localStorage.getItem("username")
  const group = await groupdb.get(`/groups/${groupName}`)

  // 🔒 Reject access if user is not a member
  if (!group.members || !group.members[username]) {
    alert("You are not a member of this private group.")
    return
  }

  currentGroup = groupName

  document.getElementById("groupChat").classList.remove("hidden")
  document.getElementById("groupChatHeader").innerHTML = `
    <h2>${groupName}</h2>
    ${group.creator === username ? `<button id="inviteBtn" class="btn-secondary">Invite</button>` : ""}
  `

  if (group.creator === username) {
    document.getElementById("inviteBtn").onclick = () => inviteUser(groupName)
  }

  loadMessages(groupName)
}

// ======================================
// LOAD GROUP MESSAGES
// ======================================
async function loadMessages(groupName) {
  const messages = await groupdb.get(`/groups/${groupName}/messages`)
  const container = document.getElementById("groupMessages")
  container.innerHTML = ""

  if (messages) {
    Object.values(messages)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach((msg) => {
        const div = document.createElement("div")
        div.className = "message received"

        const time = new Date(msg.createdAt).toLocaleTimeString()

        div.innerHTML = `
          <strong>${escapeHtml(msg.author)}</strong>: 
          ${escapeHtml(msg.text)}
          <div class="message-time">${time}</div>
        `

        container.appendChild(div)
      })
  }

  container.scrollTop = container.scrollHeight
}

// ======================================
// CREATE GROUP (private by default)
// ======================================
document.getElementById("createGroupBtn").addEventListener("click", () => {
  document.getElementById("createGroupModal").classList.remove("hidden")
})

document.getElementById("closeGroupModal").addEventListener("click", () => {
  document.getElementById("createGroupModal").classList.add("hidden")
})

document.getElementById("confirmCreateGroup").addEventListener("click", async () => {
  const groupName = document.getElementById("groupName").value.trim()
  const username = localStorage.getItem("username")

  if (!groupName) {
    alert("Group name cannot be empty")
    return
  }

  // Create private group with creator as first member
  await groupdb.set(`/groups/${groupName}`, {
    creator: username,
    createdAt: new Date().toISOString(),
    members: {
      [username]: true,
    },
    messages: {}
  })

  document.getElementById("groupName").value = ""
  document.getElementById("createGroupModal").classList.add("hidden")

  loadGroups()
})

// ======================================
// INVITE USER TO GROUP (creator only)
// ======================================
async function inviteUser(groupName) {
  const usernameToInvite = prompt("Enter username to invite:")

  if (!usernameToInvite) return

  const group = await groupdb.get(`/groups/${groupName}`)

  group.members = group.members || {}
  group.members[usernameToInvite] = true

  await groupdb.set(`/groups/${groupName}/members`, group.members)

  alert(`User ${usernameToInvite} has been added to the group.`)
  loadGroups()
}

// ======================================
// SEND MESSAGE
// ======================================
document.getElementById("sendGroupMessageBtn").addEventListener("click", async () => {
  if (!currentGroup) return alert("Select a group first")

  const text = document.getElementById("groupMessageText").value.trim()
  if (!text) return

  const username = localStorage.getItem("username")

  await groupdb.push(`/groups/${currentGroup}/messages`, {
    author: username,
    text,
    createdAt: new Date().toISOString()
  })

  document.getElementById("groupMessageText").value = ""

  loadMessages(currentGroup)
})

// Auto-refresh
setInterval(() => {
  if (currentGroup) loadMessages(currentGroup)
}, 3000)

// Init
document.addEventListener("DOMContentLoaded", () => {
  checkAuth()
  loadGroups()
})
