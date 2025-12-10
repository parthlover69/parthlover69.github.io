// js/admin.js
// Admin panel backed by the same Firebase Realtime DB API used elsewhere.
// Auto-auth based on username - rlippman is super admin, others need isAdmin flag

const FEED_DB_URL = "https://parthsocial-2f4bb-default-rtdb.firebaseio.com/";
const adminDB = new FirebaseAPI(FEED_DB_URL);

// DOM
const adminContainer = document.getElementById("adminContainer");
const signOutAdmin = document.getElementById("signOutAdmin");

const tabs = document.querySelectorAll(".admin-tab");
const tabContents = document.querySelectorAll(".admin-tab-content");

// stats
const totalUsersEl = document.getElementById("totalUsers");
const totalPostsEl = document.getElementById("totalPosts");
const activeInviteCodesEl = document.getElementById("activeInviteCodes");
const bannedUsersEl = document.getElementById("bannedUsers");

// areas
const inviteCodesList = document.getElementById("inviteCodesList");
const usersList = document.getElementById("usersList");
const postsList = document.getElementById("postsList");
const logsList = document.getElementById("logsList");

// form elements
const inviteCodeInput = document.getElementById("inviteCodeInput");
const inviteCodeNotes = document.getElementById("inviteCodeNotes");
const createInviteCodeBtn = document.getElementById("createInviteCode");
const refreshInviteCodesBtn = document.getElementById("refreshInviteCodes");

const promoteUsername = document.getElementById("promoteUsername");
const promoteUserBtn = document.getElementById("promoteUserBtn");
const refreshUsersBtn = document.getElementById("refreshUsers");
const exportUsersBtn = document.getElementById("exportUsers");

const refreshFeedBtn = document.getElementById("refreshFeed");
const refreshLogsBtn = document.getElementById("refreshLogs");
const clearLogsBtn = document.getElementById("clearLogs");

// state
let adminAuthenticated = false;
let currentUser = null;
let isSuperAdmin = false;

// Helper: log admin actions
async function adminLog(action, details = {}) {
  try {
    await adminDB.push("/adminLogs", {
      action,
      user: currentUser || "admin",
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("adminLog failed", e);
  }
}

// Check if user is rlippman (super admin)
async function checkSuperAdmin(username) {
  return username === "rlippman";
}

// Auto-auth flow - check if user is admin
async function handleAdminAuthFlow() {
  try {
    // Check if user is logged in
    const token = localStorage.getItem("authToken");
    if (!token) {
      // Redirect to login if not authenticated
      window.location.href = "index.html";
      return;
    }

    // Get user info from session
    const session = await adminDB.get(`/sessions/${token}`);
    if (!session) {
      // Invalid session, redirect to login
      localStorage.removeItem("authToken");
      localStorage.removeItem("username");
      window.location.href = "index.html";
      return;
    }

    currentUser = session.username;
    isSuperAdmin = await checkSuperAdmin(currentUser);
    
    // Check if user is admin
    const user = await adminDB.get(`/users/${currentUser}`);
    const isAdmin = user && user.isAdmin;

    if (!isSuperAdmin && !isAdmin) {
      // Not an admin, redirect to feed
      window.location.href = "feed.html";
      return;
    }

    // User is admin, show admin panel
    adminAuthenticated = true;
    adminContainer.classList.remove("hidden");
    startAdminUI();
    return;
  } catch (err) {
    console.error("handleAdminAuthFlow error", err);
    // Redirect to feed on error
    window.location.href = "feed.html";
  }
}

// Start admin UI after authentication
async function startAdminUI() {
  // Bind UI only once
  bindUI();
  await loadAllStats();
  await loadInviteCodes();
  await loadUsers();
  await loadPosts();
  await loadLogs();
  // refresh periodically
  setInterval(() => loadAllStats().catch(()=>{}), 7000);
}

// UI bindings
function bindUI() {
  // tabs
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.getAttribute("data-tab");
    tabContents.forEach(c => {
      if (c.id === tab) c.classList.add("active");
      else c.classList.remove("active");
    });
  }));

  // sign out
  if (signOutAdmin) signOutAdmin.addEventListener("click", () => {
    adminAuthenticated = false;
    adminLog("admin_logout", { by: currentUser });
    window.location.href = "feed.html";
  });

  // create invite code
  if (createInviteCodeBtn) createInviteCodeBtn.addEventListener("click", async () => {
    const code = inviteCodeInput.value.trim() || generateInviteCode();
    const notes = inviteCodeNotes.value.trim();
    
    try {
      await adminDB.set(`/inviteCodes/${code}`, {
        code,
        notes,
        createdAt: new Date().toISOString(),
        createdBy: currentUser,
        used: false
      });
      
      await adminLog("invite_code_created", { code, notes });
      inviteCodeInput.value = "";
      inviteCodeNotes.value = "";
      await loadInviteCodes();
      await loadAllStats();
    } catch (e) {
      console.error("Failed to create invite code", e);
      showMessage("Failed to create invite code", "error");
    }
  });

  // refresh buttons
  if (refreshInviteCodesBtn) refreshInviteCodesBtn.addEventListener("click", loadInviteCodes);
  if (refreshUsersBtn) refreshUsersBtn.addEventListener("click", loadUsers);
  if (refreshFeedBtn) refreshFeedBtn.addEventListener("click", loadPosts);
  if (refreshLogsBtn) refreshLogsBtn.addEventListener("click", loadLogs);

  // export users
  if (exportUsersBtn) exportUsersBtn.addEventListener("click", async () => {
    const users = await adminDB.get("/users");
    const data = JSON.stringify(users || {}, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users-export.json"; a.click(); URL.revokeObjectURL(url);
  });

  // clear logs
  if (clearLogsBtn) clearLogsBtn.addEventListener("click", async () => {
    if (!confirm("Clear all logs?")) return;
    await adminDB.set("/adminLogs", {});
    await loadLogs();
  });

  // promote user
  if (promoteUserBtn) promoteUserBtn.addEventListener("click", async () => {
    const username = promoteUsername.value.trim();
    if (!username) {
      showMessage("Username is required", "error");
      return;
    }

    try {
      if (!isSuperAdmin) {
        showMessage("Only rlippman can promote admins", "error");
        return;
      }

      const user = await adminDB.get(`/users/${username}`);
      if (!user) {
        showMessage("User not found", "error");
        return;
      }

      if (user.isAdmin) {
        showMessage("User is already an admin", "error");
        return;
      }

      await adminDB.set(`/users/${username}/isAdmin`, true);
      await adminLog("admin_promoted", { promotedUser: username });
      
      promoteUsername.value = "";
      await loadUsers();
      showMessage(`${username} has been promoted to admin`, "success");
    } catch (e) {
      console.error("Failed to promote admin", e);
      showMessage("Failed to promote admin", "error");
    }
  });
}

// Generate random invite code
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Show message helper
function showMessage(message, type = "info") {
  const messageDiv = document.createElement("div");
  messageDiv.className = `${type}-message`;
  messageDiv.textContent = message;
  
  const container = document.querySelector(".admin-main");
  container.insertBefore(messageDiv, container.firstChild);
  
  setTimeout(() => {
    messageDiv.remove();
  }, 3000);
}

// Load stats
async function loadAllStats() {
  try {
    const [users, posts, inviteCodes] = await Promise.all([
      adminDB.get("/users"),
      adminDB.get("/posts"),
      adminDB.get("/inviteCodes"),
    ]);
    
    const userCount = users ? Object.keys(users).length : 0;
    const postCount = posts ? Object.keys(posts).length : 0;
    
    let activeCodeCount = 0;
    if (inviteCodes) {
      activeCodeCount = Object.values(inviteCodes).filter(code => !code.used).length;
    }
    
    let bannedCount = 0;
    if (users) {
      bannedCount = Object.values(users).filter(user => user.banned).length;
    }
    
    totalUsersEl.textContent = userCount;
    totalPostsEl.textContent = postCount;
    activeInviteCodesEl.textContent = activeCodeCount;
    bannedUsersEl.textContent = bannedCount;
  } catch (e) {
    console.error("loadAllStats failed", e);
  }
}

// Load invite codes
async function loadInviteCodes() {
  if (!inviteCodesList) return;
  inviteCodesList.innerHTML = "<div class='loading'>Loading invite codes...</div>";
  try {
    const inviteCodes = await adminDB.get("/inviteCodes");
    inviteCodesList.innerHTML = "";
    
    if (!inviteCodes || Object.keys(inviteCodes).length === 0) {
      inviteCodesList.innerHTML = `<div class="info-message">No invite codes found</div>`;
      return;
    }
    
    Object.entries(inviteCodes).forEach(([code, data]) => {
      const item = document.createElement("div");
      item.className = "admin-item";
      
      const status = data.used ? 
        `<span style="color: #ff4d4d;">Used by ${data.usedBy || 'Unknown'}</span>` : 
        `<span style="color: #4dff4d;">Active</span>`;
      
      item.innerHTML = `
        <div class="item-header">
          <div>
            <div class="item-title">${escapeHtml(code)}</div>
            <div class="item-meta">
              Created: ${escapeHtml(new Date(data.createdAt || "").toLocaleString())}
              ${data.createdBy ? ` by ${escapeHtml(data.createdBy)}` : ""}
              ${data.notes ? `<br>Notes: ${escapeHtml(data.notes)}` : ""}
            </div>
          </div>
          <div>${status}</div>
        </div>
        <div class="item-actions">
          ${data.used ? 
            `<button class="btn btn-secondary btn-sm" disabled>Cancel</button>` : 
            `<button class="btn btn-danger btn-sm cancel-code" data-code="${escapeHtml(code)}">Cancel</button>`
          }
        </div>
      `;
      
      // Cancel code action
      const cancelBtn = item.querySelector(".cancel-code");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", async () => {
          if (!confirm(`Cancel invite code ${code}?`)) return;
          
          try {
            await adminDB.delete(`/inviteCodes/${code}`);
            await adminLog("invite_code_cancelled", { code });
            await loadInviteCodes();
            await loadAllStats();
          } catch (e) {
            console.error("Failed to cancel invite code", e);
            showMessage("Failed to cancel invite code", "error");
          }
        });
      }
      
      inviteCodesList.appendChild(item);
    });
  } catch (e) {
    console.error("loadInviteCodes failed", e);
    inviteCodesList.innerHTML = `<div class="error-message">Failed to load invite codes</div>`;
  }
}

// Load users
async function loadUsers() {
  if (!usersList) return;
  usersList.innerHTML = "<div class='loading'>Loading users...</div>";
  try {
    const users = await adminDB.get("/users");
    usersList.innerHTML = "";
    
    if (!users || Object.keys(users).length === 0) {
      usersList.innerHTML = `<div class="info-message">No users found</div>`;
      return;
    }
    
    Object.entries(users).forEach(([username, data]) => {
      const item = document.createElement("div");
      item.className = "admin-item";
      
      const banned = data && data.banned;
      const isAdmin = data && data.isAdmin;
      const isRlippman = username === "rlippman";
      
      item.innerHTML = `
        <div class="item-header">
          <div>
            <div class="item-title">
              ${escapeHtml(username)}
              ${isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}
              ${isRlippman ? '<span class="admin-badge">SUPER ADMIN</span>' : ''}
            </div>
            <div class="item-meta">
              ${data && data.email ? escapeHtml(data.email) : ''}
              ${data && data.createdAt ? `<br>Joined: ${escapeHtml(new Date(data.createdAt).toLocaleString())}` : ''}
            </div>
          </div>
          <div>${banned ? '<span style="color: #ff4d4d;">BANNED</span>' : '<span style="color: #4dff4d;">ACTIVE</span>'}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm view-profile" data-user="${escapeHtml(username)}">View Profile</button>
          ${!isRlippman ? `
            <button class="btn btn-danger btn-sm ban-user" data-user="${escapeHtml(username)}">${banned ? "Unban" : "Ban"}</button>
          ` : '<button class="btn btn-secondary btn-sm" disabled>Protected</button>'}
        </div>
      `;
      
      // View profile action
      const viewBtn = item.querySelector(".view-profile");
      if (viewBtn) {
        viewBtn.addEventListener("click", () => {
          window.location.href = `profile.html?user=${username}`;
        });
      }
      
      // Ban/unban action
      const banBtn = item.querySelector(".ban-user");
      if (banBtn) {
        banBtn.addEventListener("click", async () => {
          const user = banBtn.getAttribute("data-user");
          const cur = users[user] || {};
          const nowBanned = !cur.banned;
          
          if (!confirm(`${nowBanned ? 'Ban' : 'Unban'} user ${user}?`)) return;
          
          try {
            await adminDB.set(`/users/${user}/banned`, nowBanned);
            await adminLog(nowBanned ? "user_banned" : "user_unbanned", { user });
            await loadUsers();
            await loadAllStats();
          } catch (e) {
            console.error("Failed to ban/unban user", e);
            showMessage("Failed to update user status", "error");
          }
        });
      }
      
      usersList.appendChild(item);
    });
  } catch (e) {
    console.error("loadUsers failed", e);
    usersList.innerHTML = `<div class="error-message">Failed to load users</div>`;
  }
}

// Load posts for moderation
async function loadPosts() {
  if (!postsList) return;
  postsList.innerHTML = "<div class='loading'>Loading posts...</div>";
  try {
    const posts = await adminDB.get("/posts");
    const users = await adminDB.get("/users");
    postsList.innerHTML = "";
    
    if (!posts || Object.keys(posts).length === 0) {
      postsList.innerHTML = `<div class="info-message">No posts found</div>`;
      return;
    }
    
    const arr = Object.entries(posts).map(([id, p]) => ({ id, ...(p || {}) }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    arr.forEach(post => {
      const item = document.createElement("div");
      item.className = "admin-item";
      
      const author = post.author || "unknown";
      const avatar = users && users[author] ? users[author].avatar : null;
      const avatarHtml = avatar ? `<img src="${avatar.startsWith("data:")? avatar : 'data:image/png;base64,'+avatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--hover-bg);"></div>`;
      const content = escapeHtml(post.content || "");
      const time = post.createdAt ? new Date(post.createdAt).toLocaleString() : "";
      
      const mediaHtmlParts = [];
      if (post.image) {
        const img = (typeof post.image === "string" && post.image.startsWith("data:")) ? post.image : `data:image/png;base64,${post.image}`;
        mediaHtmlParts.push(`<div class="post-media"><img src="${img}"></div>`);
      }
      if (post.video) {
        const vid = (typeof post.video === "string" && post.video.startsWith("data:")) ? post.video : `data:video/mp4;base64,${post.video}`;
        mediaHtmlParts.push(`<div class="post-media"><video controls src="${vid}"></video></div>`);
      }

      item.innerHTML = `
        <div class="item-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${avatarHtml}
            <div>
              <div class="item-title">${escapeHtml(author)}</div>
              <div class="item-meta">${escapeHtml(time)}</div>
            </div>
          </div>
          ${post.deleted ? '<span style="color: #ff4d4d;">DELETED</span>' : '<span style="color: #4dff4d;">ACTIVE</span>'}
        </div>
        <div class="post-content">${content}</div>
        ${mediaHtmlParts.length > 0 ? `<div>${mediaHtmlParts.join("")}</div>` : ''}
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm edit-post" data-id="${escapeHtml(post.id)}">Edit</button>
          <button class="btn btn-danger btn-sm delete-post" data-id="${escapeHtml(post.id)}">${post.deleted ? "Permanent Delete" : "Delete"}</button>
          <button class="btn btn-danger btn-sm ban-post-user" data-author="${escapeHtml(author)}">Ban User</button>
        </div>
      `;

      // Edit post action
      const editBtn = item.querySelector(".edit-post");
      if (editBtn) {
        editBtn.addEventListener("click", () => {
          const newContent = prompt("Edit post content:", post.content || "");
          if (newContent !== null) {
            updatePostContent(post.id, newContent);
          }
        });
      }

      // Delete post action
      const delBtn = item.querySelector(".delete-post");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm(`${post.deleted ? 'Permanently delete' : 'Delete'} this post?`)) return;
          
          try {
            if (post.deleted) {
              await adminDB.delete(`/posts/${post.id}`);
              await adminLog("post_deleted_permanent", { postId: post.id });
            } else {
              await adminDB.set(`/posts/${post.id}/deleted`, true);
              await adminLog("post_deleted", { postId: post.id });
            }
            await loadPosts();
            await loadAllStats();
          } catch (e) {
            console.error("Failed to delete post", e);
            showMessage("Failed to delete post", "error");
          }
        });
      }

      // Ban user from post action
      const banBtn = item.querySelector(".ban-post-user");
      if (banBtn) {
        banBtn.addEventListener("click", async () => {
          if (!confirm(`Ban user ${post.author}?`)) return;
          
          try {
            await adminDB.set(`/users/${post.author}/banned`, true);
            await adminLog("user_banned", { user: post.author });
            await loadUsers();
            await loadAllStats();
          } catch (e) {
            console.error("Failed to ban user", e);
            showMessage("Failed to ban user", "error");
          }
        });
      }

      postsList.appendChild(item);
    });
  } catch (e) {
    console.error("loadPosts failed", e);
    postsList.innerHTML = `<div class="error-message">Failed to load posts</div>`;
  }
}

// Update post content
async function updatePostContent(postId, content) {
  try {
    await adminDB.set(`/posts/${postId}/content`, content);
    await adminLog("post_edited", { postId, content });
    await loadPosts();
  } catch (e) {
    console.error("Failed to update post", e);
    showMessage("Failed to update post", "error");
  }
}

// Load logs
async function loadLogs() {
  if (!logsList) return;
  logsList.innerHTML = "<div class='loading'>Loading logs...</div>";
  try {
    const logs = await adminDB.get("/adminLogs") || {};
    logsList.innerHTML = "";
    
    if (!logs || Object.keys(logs).length === 0) {
      logsList.innerHTML = `<div class="info-message">No logs found</div>`;
      return;
    }
    
    const arr = Object.entries(logs).map(([, l]) => l)
      .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 200);
    
    arr.forEach(l => {
      const item = document.createElement("div");
      item.className = "admin-item";
      
      item.innerHTML = `
        <div class="item-header">
          <div>
            <div class="item-title">${escapeHtml(l.action)}</div>
            <div class="item-meta">
              By: ${escapeHtml(l.user || 'Unknown')} - ${escapeHtml(new Date(l.timestamp).toLocaleString())}
            </div>
          </div>
        </div>
        ${l.details ? `<div class="item-meta">${escapeHtml(JSON.stringify(l.details))}</div>` : ''}
      `;
      
      logsList.appendChild(item);
    });
  } catch (e) {
    console.error("loadLogs failed", e);
    logsList.innerHTML = `<div class="error-message">Failed to load logs</div>`;
  }
}

// Utilities
function escapeHtml(t = "") {
  return String(t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
  await handleAdminAuthFlow();
});
