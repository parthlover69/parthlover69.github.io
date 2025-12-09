// js/admin.js
// Admin panel backed by the same Firebase Realtime DB API used elsewhere.
// Single-admin-password model: the hash lives at /admin/password (sha256 hex string) or null.
// If /admin/password doesn't exist, this script will create it and set to null.

const FEED_DB_URL = "https://parthsocial-2f4bb-default-rtdb.firebaseio.com/";
const adminDB = new FirebaseAPI(FEED_DB_URL);

// DOM
const adminContainer = document.getElementById("adminContainer");
const pwModal = document.getElementById("pwModal");
const pwTitle = document.getElementById("pwTitle");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const pwSubmit = document.getElementById("pwSubmit");
const pwError = document.getElementById("pwError");
const pwClose = document.getElementById("pwClose");

const tabs = document.querySelectorAll(".admin-tab");
const tabContents = document.querySelectorAll(".admin-tab-content");
const refreshBtn = document.getElementById("refreshBtn");
const adminSearch = document.getElementById("adminSearch");
const signOutAdmin = document.getElementById("signOutAdmin");

// areas
const totalUsersEl = document.getElementById("totalUsers");
const totalPostsEl = document.getElementById("totalPosts");
const totalGroupsEl = document.getElementById("totalGroups");
const postsList = document.getElementById("postsList");
const usersList = document.getElementById("usersList");
const logsList = document.getElementById("logsList");

const dmConversations = document.getElementById("dmConversations");
const dmThread = document.getElementById("dmThread");
const dmThreadHeader = document.getElementById("dmThreadHeader");
const dmMessages = document.getElementById("dmMessages");

const adminGroupsList = document.getElementById("adminGroupsList");
const groupChat = document.getElementById("groupChat");
const groupHeader = document.getElementById("groupHeader");
const groupMessages = document.getElementById("groupMessages");

const profileEditor = document.getElementById("profileEditor");

// edit post modal
const editPostModal = document.getElementById("editPostModal");
const editPostClose = document.getElementById("editPostClose");
const editPostBody = document.getElementById("editPostBody");
const savePostBtn = document.getElementById("savePostBtn");
const deletePostBtn = document.getElementById("deletePostBtn");

// state
let adminAuthenticated = false;
let currentEditingPost = null;

// Helper: log admin actions
async function adminLog(action, details = {}) {
  try {
    await adminDB.push("/adminLogs", {
      action,
      user: localStorage.getItem("username") || "admin",
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("adminLog failed", e);
  }
}

// Ensure /admin/password exists (create with null if missing). Returns the stored value (string or null).
async function ensureAdminPasswordNode() {
  try {
    const pwNode = await adminDB.get("/admin/password");
    // Distinguish between 'undefined' (node missing) and explicit null
    if (typeof pwNode === "undefined") {
      // create node and set to null
      await adminDB.set("/admin/password", null);
      return null;
    }
    return pwNode; // could be null or string
  } catch (e) {
    console.error("ensureAdminPasswordNode error", e);
    // In case of any error, return null to avoid locking out admin
    return null;
  }
}

// Show password modal
function showPwModal(title = "Admin Login", instructions = "Please enter the admin password to access the panel.") {
  pwTitle.textContent = title;
  const inst = document.getElementById("pwInstructions");
  if (inst) inst.textContent = instructions;
  if (adminPasswordInput) adminPasswordInput.value = "";
  if (pwError) pwError.textContent = "";
  pwModal.classList.remove("hidden");
  pwModal.setAttribute("aria-hidden", "false");
}

// Hide password modal
function hidePwModal() {
  pwModal.classList.add("hidden");
  pwModal.setAttribute("aria-hidden", "true");
}

// New auth flow (robust): if password node missing -> create & set null and ALLOW access
// if password === null -> allow access (but advise setting one)
// if password is string -> require entering matching sha256 hash
async function handleAdminAuthFlow() {
  try {
    const stored = await ensureAdminPasswordNode();

    // If stored is null -> no password set; allow access but log and show notice inside UI
    if (stored === null) {
      await adminLog("admin_access_no_password", { by: localStorage.getItem("username") || "unknown" });
      // show admin UI and inform
      document.getElementById("adminContainer").classList.remove("hidden");
      // small non-blocking notice in pw modal area (we'll not show modal)
      hidePwModal();
      adminAuthenticated = true;
      startAdminUI();
      return;
    }

    // If stored is a non-empty string -> require password
    showPwModal("Admin Login", "Enter admin password.");

    pwSubmit.onclick = async () => {
      const raw = adminPasswordInput.value || "";
      if (!raw) {
        pwError.textContent = "Password required.";
        return;
      }
      try {
        const hash = sha256(raw);
        if (hash === stored) {
          adminAuthenticated = true;
          hidePwModal();
          await adminLog("admin_login_success", { by: localStorage.getItem("username") || "unknown" });
          startAdminUI();
        } else {
          await adminLog("admin_login_failed", { by: localStorage.getItem("username") || "unknown" });
          pwError.textContent = "Incorrect password.";
        }
      } catch (e) {
        console.error("auth error", e);
        pwError.textContent = "Auth error.";
      }
    };

    pwClose.onclick = () => {
      // non-authorized users are redirected to feed
      window.location.href = "feed.html";
    };
  } catch (err) {
    console.error("handleAdminAuthFlow error", err);
    // fail open to avoid locking out admin when DB temporarily unavailable
    document.getElementById("adminContainer").classList.remove("hidden");
    adminAuthenticated = true;
    startAdminUI();
  }
}

// Start admin UI after authentication
async function startAdminUI() {
  // Bind UI only once
  bindUI();
  await loadAllStats();
  await loadPosts();
  await loadUsers();
  await loadGroups();
  await loadLogs();
  await loadConversations();
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
      if (c.id === tab) c.classList.remove("hidden");
      else c.classList.add("hidden");
    });
  }));

  // refresh
  if (refreshBtn) refreshBtn.addEventListener("click", async () => {
    await loadAllStats();
    await Promise.all([loadPosts(), loadUsers(), loadGroups(), loadLogs(), loadConversations()]);
  });

  // search
  if (adminSearch) adminSearch.addEventListener("input", () => {
    const q = adminSearch.value.trim().toLowerCase();
    filterList(postsList, q);
    filterList(usersList, q);
    filterList(adminGroupsList, q);
  });

  // sign out
  if (signOutAdmin) signOutAdmin.addEventListener("click", () => {
    adminAuthenticated = false;
    adminLog("admin_logout", { by: localStorage.getItem("username") || "unknown" });
    window.location.href = "feed.html";
  });

  // edit post modal handlers
  if (editPostClose) editPostClose.addEventListener("click", () => { closeEditPostModal(); });
  if (savePostBtn) savePostBtn.addEventListener("click", async () => { await saveEditedPost(); });
  if (deletePostBtn) deletePostBtn.addEventListener("click", async () => { await adminDeletePost(currentEditingPost); });

  // clear logs
  const clearLogsBtn = document.getElementById("clearLogsBtn");
  if (clearLogsBtn) clearLogsBtn.addEventListener("click", async () => {
    if (!confirm("Clear all logs?")) return;
    await adminDB.set("/adminLogs", {});
    await loadLogs();
  });

  // reload users / export
  const reloadUsersBtn = document.getElementById("reloadUsers");
  if (reloadUsersBtn) reloadUsersBtn.addEventListener("click", loadUsers);
  const exportUsersBtn = document.getElementById("exportUsers");
  if (exportUsersBtn) exportUsersBtn.addEventListener("click", async () => {
    const users = await adminDB.get("/users");
    const data = JSON.stringify(users || {}, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users-export.json"; a.click(); URL.revokeObjectURL(url);
  });
}

// Simple filter helper
function filterList(container, q) {
  if (!container) return;
  const children = Array.from(container.children);
  children.forEach(ch => {
    const text = ch.textContent.toLowerCase();
    ch.style.display = q ? (text.includes(q) ? "" : "none") : "";
  });
}

// Load stats
async function loadAllStats() {
  try {
    const [users, posts, groups] = await Promise.all([
      adminDB.get("/users"),
      adminDB.get("/posts"),
      adminDB.get("/groups"),
    ]);
    totalUsersEl.textContent = users ? Object.keys(users).length : 0;
    totalPostsEl.textContent = posts ? Object.keys(posts).length : 0;
    totalGroupsEl.textContent = groups ? Object.keys(groups).length : 0;
  } catch (e) {
    console.error("loadAllStats failed", e);
  }
}

// POSTS moderation
async function loadPosts() {
  if (!postsList) return;
  postsList.innerHTML = "<div class='loading'>Loading posts...</div>";
  try {
    const posts = await adminDB.get("/posts");
    const users = await adminDB.get("/users");
    postsList.innerHTML = "";
    if (!posts) {
      postsList.innerHTML = `<div class="info-message">No posts found</div>`;
      return;
    }
    const arr = Object.entries(posts).map(([id, p]) => ({ id, ...(p || {}) }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    arr.forEach(post => {
      const el = document.createElement("div");
      el.className = "post";
      const author = post.author || "unknown";
      const avatar = users && users[author] ? users[author].avatar : null;
      const avatarHtml = avatar ? `<img src="${avatar.startsWith("data:")? avatar : 'data:image/png;base64,'+avatar}" class="avatar-sm">` : `<div class="avatar-sm placeholder"></div>`;
      const content = escapeHtml(post.content || "");
      const time = post.createdAt ? new Date(post.createdAt).toLocaleString() : "";
      const mediaHtmlParts = [];
      if (post.image) {
        const img = (typeof post.image === "string" && post.image.startsWith("data:")) ? post.image : `data:image/png;base64,${post.image}`;
        mediaHtmlParts.push(`<div class="post-image post-media"><img src="${img}"></div>`);
      }
      if (post.video) {
        const vid = (typeof post.video === "string" && post.video.startsWith("data:")) ? post.video : `data:video/mp4;base64,${post.video}`;
        mediaHtmlParts.push(`<div class="post-video post-media"><video controls src="${vid}"></video></div>`);
      }

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${avatarHtml}
            <div><strong>${escapeHtml(author)}</strong><div style="font-size:11px;color:var(--text-secondary)">${escapeHtml(time)}</div></div>
          </div>
          <div>
            <button class="btn-secondary btn-sm view-post" data-id="${escapeHtml(post.id)}">View</button>
            <button class="btn-danger btn-sm del-post" data-id="${escapeHtml(post.id)}">Delete</button>
            <button class="btn-secondary btn-sm ban-user" data-author="${escapeHtml(author)}">Ban</button>
          </div>
        </div>
        <div style="margin-top:10px;">${content}</div>
        <div style="margin-top:10px;">${mediaHtmlParts.join("")}</div>
      `;

      // actions
      const viewBtn = el.querySelector(".view-post");
      const delBtn = el.querySelector(".del-post");
      const banBtn = el.querySelector(".ban-user");
      if (viewBtn) viewBtn.addEventListener("click", () => openEditPostModal(post));
      if (delBtn) delBtn.addEventListener("click", async () => {
        if (!confirm("Delete this post (soft delete)?")) return;
        await adminDB.set(`/posts/${post.id}/deleted`, true);
        await adminLog("post_deleted", { postId: post.id, by: localStorage.getItem("username") || "admin" });
        await loadPosts();
      });
      if (banBtn) banBtn.addEventListener("click", async () => {
        if (!confirm(`Ban user ${post.author}? This will set users/${post.author}/banned = true`)) return;
        await adminDB.set(`/users/${post.author}/banned`, true);
        await adminLog("user_banned", { user: post.author });
        alert(`User ${post.author} banned.`);
        await loadUsers();
      });

      postsList.appendChild(el);
    });
  } catch (e) {
    console.error("loadPosts failed", e);
    postsList.innerHTML = `<div class="error-message">Failed to load posts</div>`;
  }
}

// Open edit post modal
function openEditPostModal(post) {
  currentEditingPost = post;
  editPostBody.innerHTML = `
    <div>
      <strong>Author:</strong> ${escapeHtml(post.author)}<br>
      <strong>Created:</strong> ${escapeHtml(new Date(post.createdAt||"").toLocaleString())}
    </div>
    <div style="margin-top:8px;">
      <textarea id="editPostContent" class="modal-text">${escapeHtml(post.content||"")}</textarea>
    </div>
    <div id="editPostMedia" style="margin-top:8px;">${post.image ? `<div class="post-image post-media"><img src="${post.image.startsWith("data:") ? post.image : 'data:image/png;base64,'+post.image}"></div>` : ""}${post.video ? `<div class="post-video post-media"><video controls src="${post.video.startsWith("data:")?post.video:'data:video/mp4;base64,'+post.video}"></video></div>` : ""}</div>
    <div style="margin-top:8px;">
      <label><input type="checkbox" id="editPostDeleted" ${post.deleted ? "checked" : ""}> Mark as deleted</label>
    </div>
  `;
  editPostModal.classList.remove("hidden");
  editPostModal.setAttribute("aria-hidden", "false");
}

// Close edit modal
function closeEditPostModal() {
  currentEditingPost = null;
  editPostModal.classList.add("hidden");
  editPostModal.setAttribute("aria-hidden", "true");
}

// Save edited post
async function saveEditedPost() {
  if (!currentEditingPost) return;
  const content = document.getElementById("editPostContent").value.trim();
  const deleted = document.getElementById("editPostDeleted").checked;
  try {
    await adminDB.set(`/posts/${currentEditingPost.id}/content`, content);
    await adminDB.set(`/posts/${currentEditingPost.id}/deleted`, deleted || null);
    await adminLog("post_edited", { postId: currentEditingPost.id, content, deleted });
    closeEditPostModal();
    await loadPosts();
  } catch (e) {
    console.error("saveEditedPost failed", e);
    alert("Save failed");
  }
}

// Admin delete post (from modal)
async function adminDeletePost(post) {
  if (!post) return;
  if (!confirm("Delete this post permanently (removes from DB)?")) return;
  try {
    await adminDB.delete(`/posts/${post.id}`);
    await adminLog("post_deleted_permanent", { postId: post.id });
    closeEditPostModal();
    await loadPosts();
  } catch (e) {
    console.error("adminDeletePost failed", e);
    alert("Delete failed");
  }
}

// USERS
async function loadUsers() {
  if (!usersList) return;
  usersList.innerHTML = "<div class='loading'>Loading users...</div>";
  try {
    const users = await adminDB.get("/users");
    usersList.innerHTML = "";
    if (!users) {
      usersList.innerHTML = `<div class="info-message">No users found</div>`;
      return;
    }
    Object.entries(users).forEach(([username, data]) => {
      const item = document.createElement("div");
      item.className = "group-item";
      const banned = data && data.banned;
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:bold;color:var(--accent)">${escapeHtml(username)} ${data && data.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">${data && data.email ? escapeHtml(data.email) : ''}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary view-user" data-user="${escapeHtml(username)}">View</button>
            <button class="btn-danger del-user" data-user="${escapeHtml(username)}">Delete</button>
            <button class="btn-secondary ban-user2" data-user="${escapeHtml(username)}">${banned ? "Unban" : "Ban"}</button>
          </div>
        </div>
      `;
      // actions
      item.querySelector(".view-user").addEventListener("click", () => openUserProfileEditor(username, data));
      item.querySelector(".del-user").addEventListener("click", async () => {
        if (!confirm(`Delete user ${username}? This will remove the user node and their posts.`)) return;
        await adminDB.delete(`/users/${username}`);
        // attempt to remove posts by this user (soft: mark deleted)
        const posts = await adminDB.get("/posts");
        if (posts) {
          for (const [pid, p] of Object.entries(posts)) {
            if (p && p.author === username) {
              await adminDB.set(`/posts/${pid}/deleted`, true);
            }
          }
        }
        await adminLog("user_deleted", { user: username });
        await loadUsers();
        await loadPosts();
      });
      item.querySelector(".ban-user2").addEventListener("click", async (ev) => {
        const user = ev.currentTarget.getAttribute("data-user");
        const cur = users[user] || {};
        const nowBanned = !cur.banned;
        await adminDB.set(`/users/${user}/banned`, nowBanned);
        await adminLog(nowBanned ? "user_banned" : "user_unbanned", { user });
        await loadUsers();
      });

      usersList.appendChild(item);
    });
  } catch (e) {
    console.error("loadUsers failed", e);
    usersList.innerHTML = `<div class="error-message">Failed to load users</div>`;
  }
}

// Profile editor for admin
function openUserProfileEditor(username, userData) {
  profileEditor.innerHTML = `
    <div class="profile-header">
      <div class="avatar">${userData && userData.avatar ? `<img src="${userData.avatar.startsWith("data:")?userData.avatar:'data:image/png;base64,'+userData.avatar}">` : ''}</div>
      <div class="profile-info">
        <h1>${escapeHtml(username)}</h1>
        <div style="margin-bottom:10px;">
          <textarea id="adminEditBio" placeholder="Bio...">${userData && userData.bio ? escapeHtml(userData.bio) : ''}</textarea>
        </div>
        <div class="profile-actions">
          <button id="saveProfileBtn" class="btn-primary">Save Profile</button>
          <button id="resetPasswordBtn" class="btn-secondary">Force Reset Password (null)</button>
        </div>
        <div id="profileMsg" class="info-message"></div>
      </div>
    </div>
  `;
  document.getElementById("saveProfileBtn").addEventListener("click", async () => {
    const bio = document.getElementById("adminEditBio").value;
    await adminDB.set(`/users/${username}/bio`, bio);
    await adminLog("admin_profile_edit", { user: username });
    document.getElementById("profileMsg").textContent = "Saved.";
  });
  document.getElementById("resetPasswordBtn").addEventListener("click", async () => {
    if (!confirm(`Reset password data for ${username}? This sets /users/${username}/password = null`)) return;
    await adminDB.set(`/users/${username}/password`, null);
    await adminLog("admin_reset_user_password", { user: username });
    document.getElementById("profileMsg").textContent = "Password reset (set to null).";
  });
  // show profile tab
  tabShow("profilesTab");
}

// DMs: naive reader (looks for /dms or /messages)
async function loadConversations() {
  if (!dmConversations) return;
  dmConversations.innerHTML = "<div class='loading'>Loading...</div>";
  try {
    const dmsRoot = await adminDB.get("/dms");
    const messagesRoot = await adminDB.get("/messages");
    const dms = dmsRoot || messagesRoot || {};
    dmConversations.innerHTML = "";
    if (!dms || Object.keys(dms).length === 0) {
      dmConversations.innerHTML = `<div class="info-message">No DMs found</div>`;
      return;
    }
    // Expecting structure: dms/{convId: { participants: [...], messages: {id:{author,text,createdAt}}}}
    Object.entries(dms).forEach(([convId, conv]) => {
      const participants = conv.participants ? conv.participants.join(", ") : convId;
      const item = document.createElement("div");
      item.className = "conversation-item";
      item.textContent = participants;
      item.addEventListener("click", () => openConversation(convId, conv));
      dmConversations.appendChild(item);
    });
  } catch (e) {
    console.error("loadConversations failed", e);
    dmConversations.innerHTML = `<div class="error-message">Failed to load DMs</div>`;
  }
}

function openConversation(convId, conv) {
  if (!dmThread) return;
  dmThread.classList.remove("hidden");
  dmThreadHeader.textContent = `Conversation: ${convId}`;
  dmMessages.innerHTML = "";
  const msgs = conv.messages ? Object.entries(conv.messages).map(([id,m]) => ({ id, ...m })) : [];
  msgs.sort((a,b)=> new Date(a.createdAt||0) - new Date(b.createdAt||0));
  msgs.forEach(m => {
    const d = document.createElement("div");
    d.className = "message " + (m.author === localStorage.getItem("username") ? "sent" : "received");
    d.innerHTML = `<div>${escapeHtml(m.text||"")}</div><div class="message-time">${escapeHtml(new Date(m.createdAt||"").toLocaleString())}</div>`;
    dmMessages.appendChild(d);
  });
}

// GROUPS
async function loadGroups() {
  if (!adminGroupsList) return;
  adminGroupsList.innerHTML = "<div class='loading'>Loading groups...</div>";
  try {
    const groups = await adminDB.get("/groups") || {};
    adminGroupsList.innerHTML = "";
    if (!groups || Object.keys(groups).length === 0) {
      adminGroupsList.innerHTML = `<div class="info-message">No groups found</div>`;
      return;
    }
    Object.entries(groups).forEach(([gid, g]) => {
      const item = document.createElement("div");
      item.className = "group-item";
      item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><div><div class="group-title">${escapeHtml(g.name||gid)}</div><div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(g.description||"")}</div></div><div><button class="btn-secondary view-group" data-id="${escapeHtml(gid)}">Open</button> <button class="btn-danger del-group" data-id="${escapeHtml(gid)}">Delete</button></div></div>`;
      item.querySelector(".view-group").addEventListener("click", () => openGroup(gid, g));
      item.querySelector(".del-group").addEventListener("click", async () => {
        if (!confirm(`Delete group ${gid}?`)) return;
        await adminDB.delete(`/groups/${gid}`);
        await adminLog("group_deleted", { groupId: gid });
        await loadGroups();
      });
      adminGroupsList.appendChild(item);
    });
  } catch (e) {
    console.error("loadGroups failed", e);
    adminGroupsList.innerHTML = `<div class="error-message">Failed to load groups</div>`;
  }
}

function openGroup(gid, g) {
  groupChat.classList.remove("hidden");
  groupHeader.textContent = `Group: ${g.name || gid}`;
  groupMessages.innerHTML = "";
  const msgs = g.messages ? Object.entries(g.messages).map(([id,m]) => ({ id, ...m })) : [];
  msgs.sort((a,b)=> new Date(a.createdAt||0) - new Date(b.createdAt||0));
  msgs.forEach(m => {
    const d = document.createElement("div");
    d.className = "message received";
    d.innerHTML = `<div style="font-weight:bold;color:var(--accent)">${escapeHtml(m.author||"")}</div><div>${escapeHtml(m.text||"")}</div><div class="message-time">${escapeHtml(new Date(m.createdAt||"").toLocaleString())}</div>`;
    groupMessages.appendChild(d);
  });
}

// LOGS
async function loadLogs() {
  if (!logsList) return;
  logsList.innerHTML = "<div class='loading'>Loading logs...</div>";
  try {
    const logs = await adminDB.get("/adminLogs") || {};
    logsList.innerHTML = "";
    const arr = Object.entries(logs).map(([, l]) => l).sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp)).slice(0,200);
    arr.forEach(l => {
      const div = document.createElement("div");
      div.className = "log-entry";
      div.innerHTML = `<span class="log-time">${escapeHtml(new Date(l.timestamp).toLocaleString())}</span> - ${escapeHtml(l.action)} ${l.details ? `<pre style="white-space:pre-wrap;margin-top:6px;color:var(--text-secondary)">${escapeHtml(JSON.stringify(l.details))}</pre>` : ""}`;
      logsList.appendChild(div);
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

// Simple show tab programmatically
function tabShow(id) {
  tabs.forEach(x => x.classList.remove("active"));
  const btn = Array.from(tabs).find(x => x.getAttribute("data-tab") === id);
  if (btn) btn.classList.add("active");
  tabContents.forEach(c => c.id === id ? c.classList.remove("hidden") : c.classList.add("hidden"));
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
  // If user isn't logged in locally, set a fake username for logs
  try {
    if (!localStorage.getItem("username")) localStorage.setItem("username", "admin");
  } catch(e){}

  await handleAdminAuthFlow();
});
