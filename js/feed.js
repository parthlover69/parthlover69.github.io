
// js/feed.js - Optimized, lightweight, single-file replacement
// Assumes FirebaseAPI is available as FirebaseAPI (feedDB instance below)

// ---------- Config ----------
const FEED_DB_URL = "https://parthsocialhack-default-rtdb.firebaseio.com/";
const feedDB = new FirebaseAPI(FEED_DB_URL);

// ---------- Lightweight caches & helpers ----------
const postsCache = {};      // id -> post object (last fetched)
const postElements = {};    // id -> DOM element references
let usersCache = {};        // username -> user data
let fetching = false;
let lastFetch = 0;

// Basic safe text escape when injecting via innerHTML (only use where necessary)
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

function avatarToSrc(avatarValue) {
  if (!avatarValue) return null;
  if (typeof avatarValue === "string" && avatarValue.startsWith("data:")) return avatarValue;
  if (typeof avatarValue === "string") return `data:image/*;base64,${avatarValue}`;
  return null;
}

function currentUser() {
  return localStorage.getItem("username") || "";
}

function checkAuth() {
  const token = localStorage.getItem("authToken");
  const username = localStorage.getItem("username");
  if (!token || !username) {
    window.location.href = "index.html";
  }
}

function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("username");
  window.location.href = "index.html";
}

// ---------- Modal ----------
const postModal = document.getElementById("postModal");
const modalText = document.getElementById("modalText");
const modalClose = document.getElementById("modalClose");
const modalSave = document.getElementById("modalSave");
const modalDelete = document.getElementById("modalDelete");
const modalAuthor = document.getElementById("modalAuthor");

let editingPostId = null;

function openModal(postId, initialText = "", authorName = "", authorAvatarSrc = "") {
  editingPostId = postId;
  modalText.value = initialText || "";
  modalAuthor.innerHTML = `
    ${authorAvatarSrc ? `<img src="${authorAvatarSrc}" class="avatar-sm" onerror="this.style.display='none'">` : `<div class="avatar-sm placeholder"></div>`}
    <span class="modal-author-name">${escapeHtml(authorName)}</span>
  `;
  postModal.classList.remove("hidden");
  postModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  editingPostId = null;
  modalText.value = "";
  postModal.classList.add("hidden");
  postModal.setAttribute("aria-hidden", "true");
}

if (modalClose) modalClose.addEventListener("click", closeModal);

if (modalSave) modalSave.addEventListener("click", async () => {
  if (!editingPostId) return;
  const newText = modalText.value.trim();
  try {
    // update in DB and then update UI in-place
    await feedDB.set(`posts/${editingPostId}/content`, newText);
    const elRefs = postElements[editingPostId];
    if (elRefs && elRefs.contentEl) elRefs.contentEl.textContent = newText;
    closeModal();
  } catch (err) {
    console.error("modalSave error", err);
    alert("Failed to save post.");
  }
});

if (modalDelete) modalDelete.addEventListener("click", async () => {
  if (!editingPostId) return;
  await deletePost(editingPostId);
  closeModal();
});

// ---------- Menu ----------
function createMenu(buttonEl, post, authorData) {
  // remove existing
  document.querySelectorAll(".post-menu").forEach(n => n.remove());

  const menu = document.createElement("div");
  menu.className = "post-menu";
  menu.style.position = "absolute";
  menu.style.zIndex = 9999;
  menu.innerHTML = `
    <button class="menu-item edit">Edit</button>
    <button class="menu-item delete">Delete</button>
  `;

  const editBtn = menu.querySelector(".menu-item.edit");
  const deleteBtn = menu.querySelector(".menu-item.delete");
  const user = currentUser();

  if (post.author !== user) {
    editBtn.style.display = "none";
    deleteBtn.style.display = "none";
  } else {
    editBtn.addEventListener("click", () => {
      openModal(post.id, post.content, post.author, authorData ? avatarToSrc(authorData.avatar) : "");
      menu.remove();
    });
    deleteBtn.addEventListener("click", async () => {
      menu.remove();
      await deletePost(post.id);
    });
  }

  document.body.appendChild(menu);
  const rect = buttonEl.getBoundingClientRect();
  menu.style.left = `${Math.max(6, rect.right - 160)}px`;
  menu.style.top = `${rect.bottom + 6}px`;

  // close on outside click
  setTimeout(() => {
    function outside(e) {
      if (!menu.contains(e.target) && e.target !== buttonEl) {
        menu.remove();
        document.removeEventListener("click", outside);
      }
    }
    document.addEventListener("click", outside);
  }, 0);
}

// ---------- Render / Update logic ----------
const feedPostsEl = document.getElementById("feedPosts");

function makePostElement(post, authorData = null) {
  // container
  const container = document.createElement("div");
  container.className = "post";
  container.dataset.id = post.id;

  // author block
  const avatarSrc = authorData ? avatarToSrc(authorData.avatar) : null;
  const avatarHtml = avatarSrc
    ? `<img src="${avatarSrc}" class="avatar-sm" alt="pfp" onerror="this.style.display='none'">`
    : `<div class="avatar-sm placeholder"></div>`;

  // content and meta
  const ts = post.createdAt ? new Date(post.createdAt).toLocaleString() : "";
  const contentEl = document.createElement("div");
  contentEl.className = "post-content";
  contentEl.textContent = post.content || "";

  // header
  const header = document.createElement("div");
  header.className = "post-header";
  header.innerHTML = `
    <div class="post-left">
      <div class="author-block">${avatarHtml}<a class="post-author-link" href="profile.html?user=${encodeURIComponent(post.author)}">${escapeHtml(post.author)}</a></div>
    </div>
    <div class="post-right">
      <div class="post-time">${escapeHtml(ts)}</div>
      <button class="menu-btn" aria-label="menu">⋯</button>
    </div>
  `;

  // actions
  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likesCount = (post.likes) ? Object.keys(post.likes).length : 0;
  const lovesCount = (post.loves) ? Object.keys(post.loves).length : 0;
  const commentsCount = (post.comments) ? Object.keys(post.comments).length : 0;

  const likeBtn = document.createElement("button");
  likeBtn.className = `post-action-btn like-btn ${post.likes && post.likes[currentUser()] ? "active" : ""}`;
  likeBtn.innerHTML = `👍 <span class="count">${likesCount}</span>`;
  likeBtn.dataset.id = post.id;

  const loveBtn = document.createElement("button");
  loveBtn.className = `post-action-btn love-btn ${post.loves && post.loves[currentUser()] ? "active" : ""}`;
  loveBtn.innerHTML = `❤️ <span class="count">${lovesCount}</span>`;
  loveBtn.dataset.id = post.id;

  const commentsToggle = document.createElement("button");
  commentsToggle.className = "post-action-btn comments-toggle";
  commentsToggle.dataset.id = post.id;
  commentsToggle.innerHTML = `💬 <span class="count">${commentsCount}</span>`;

  actions.appendChild(likeBtn);
  actions.appendChild(loveBtn);
  actions.appendChild(commentsToggle);

  // comments section (hidden by default)
  const commentsSection = document.createElement("div");
  commentsSection.className = "comments-section";
  commentsSection.id = `comments-${post.id}`;
  commentsSection.style.display = "none";

  // assemble
  container.appendChild(header);
  container.appendChild(contentEl);
  container.appendChild(actions);
  container.appendChild(commentsSection);

  // attach listeners
  likeBtn.addEventListener("click", () => toggleLikeOptimistic(post.id));
  loveBtn.addEventListener("click", () => toggleLoveOptimistic(post.id));
  commentsToggle.addEventListener("click", () => toggleComments(post.id));
  const menuBtn = header.querySelector(".menu-btn");
  if (menuBtn) menuBtn.addEventListener("click", (e) => createMenu(menuBtn, post, authorData));

  // store references for in-place updates
  postElements[post.id] = {
    container,
    contentEl,
    likeBtn,
    loveBtn,
    commentsToggle,
    commentsSection,
  };

  return container;
}

function updatePostInPlace(post) {
  const refs = postElements[post.id];
  if (!refs) return;

  // update content
  if (refs.contentEl && refs.contentEl.textContent !== (post.content || "")) {
    refs.contentEl.textContent = post.content || "";
  }

  // update likes
  const likesCount = post.likes ? Object.keys(post.likes).length : 0;
  const lovesCount = post.loves ? Object.keys(post.loves).length : 0;
  const commentsCount = post.comments ? Object.keys(post.comments).length : 0;

  if (refs.likeBtn) {
    const span = refs.likeBtn.querySelector(".count");
    if (span) span.textContent = likesCount;
    if (post.likes && post.likes[currentUser()]) refs.likeBtn.classList.add("active");
    else refs.likeBtn.classList.remove("active");
  }

  if (refs.loveBtn) {
    const span = refs.loveBtn.querySelector(".count");
    if (span) span.textContent = lovesCount;
    if (post.loves && post.loves[currentUser()]) refs.loveBtn.classList.add("active");
    else refs.loveBtn.classList.remove("active");
  }

  if (refs.commentsToggle) {
    const span = refs.commentsToggle.querySelector(".count");
    if (span) span.textContent = commentsCount;
  }
}

// ---------- Load feed with minimal DOM churn ----------
async function loadFeed() {
  if (fetching) return;
  fetching = true;
  try {
    const [rawPosts = {}, rawUsers = {}] = await Promise.all([
      feedDB.get("posts") || {},
      feedDB.get("users") || {}
    ]);

    // cache users
    usersCache = rawUsers || {};

    // convert to array, filter deleted, sort desc by createdAt
    const posts = Object.entries(rawPosts)
      .map(([id, p]) => ({ id, ...(p || {}) }))
      .filter(p => !p.deleted)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const seen = new Set();

    // iterate posts and update/create nodes
    for (const post of posts) {
      seen.add(post.id);
      const prev = postsCache[post.id];

      // if not present, create element and insert
      if (!prev) {
        postsCache[post.id] = post;
        const el = makePostElement(post, usersCache[post.author]);
        // append at top to keep newest first
        if (feedPostsEl) feedPostsEl.insertBefore(el, feedPostsEl.firstChild);
      } else {
        // compare shallowly for changes that matter
        const changed = (
          prev.content !== post.content ||
          JSON.stringify(prev.likes || {}) !== JSON.stringify(post.likes || {}) ||
          JSON.stringify(prev.loves || {}) !== JSON.stringify(post.loves || {}) ||
          JSON.stringify(prev.comments || {}) !== JSON.stringify(post.comments || {})
        );
        if (changed) {
          postsCache[post.id] = post;
          updatePostInPlace(post);
        }
      }
    }

    // remove deleted posts from DOM/cache
    for (const id of Object.keys(postsCache)) {
      if (!seen.has(id)) {
        // remove DOM if exists
        const refs = postElements[id];
        if (refs && refs.container && refs.container.parentNode) refs.container.parentNode.removeChild(refs.container);
        delete postsCache[id];
        delete postElements[id];
      }
    }
    lastFetch = Date.now();
  } catch (err) {
    console.error("loadFeed error", err);
  } finally {
    fetching = false;
  }
}

// ---------- Reactions (optimistic, minimal reads) ----------
async function toggleLikeOptimistic(postId) {
  const user = currentUser();
  if (!user) return alert("Not signed in");

  // optimistic UI
  const refs = postElements[postId];
  if (!refs) return;

  // flip locally
  let likes = postsCache[postId] && postsCache[postId].likes ? { ...postsCache[postId].likes } : {};
  if (likes[user]) delete likes[user];
  else likes[user] = true;

  // update cache & UI immediately
  postsCache[postId] = { ...(postsCache[postId] || {}), likes };
  updatePostInPlace(postsCache[postId]);

  try {
    await feedDB.set(`posts/${postId}/likes`, likes);
  } catch (err) {
    console.error("toggleLike error", err);
    // revert by re-loading post
    const fresh = await feedDB.get(`posts/${postId}`);
    if (fresh) {
      postsCache[postId] = fresh;
      updatePostInPlace(fresh);
    } else {
      loadFeed();
    }
  }
}

async function toggleLoveOptimistic(postId) {
  const user = currentUser();
  if (!user) return alert("Not signed in");

  const refs = postElements[postId];
  if (!refs) return;

  let loves = postsCache[postId] && postsCache[postId].loves ? { ...postsCache[postId].loves } : {};
  if (loves[user]) delete loves[user];
  else loves[user] = true;

  postsCache[postId] = { ...(postsCache[postId] || {}), loves };
  updatePostInPlace(postsCache[postId]);

  try {
    await feedDB.set(`posts/${postId}/loves`, loves);
  } catch (err) {
    console.error("toggleLove error", err);
    const fresh = await feedDB.get(`posts/${postId}`);
    if (fresh) {
      postsCache[postId] = fresh;
      updatePostInPlace(fresh);
    } else {
      loadFeed();
    }
  }
}

// ---------- Comments ----------
async function renderComments(postId) {
  const refs = postElements[postId];
  if (!refs) return;
  const container = refs.commentsSection;
  if (!container) return;

  container.innerHTML = "<div class='loading'>Loading comments…</div>";

  try {
    const post = await feedDB.get(`posts/${postId}`);
    const comments = (post && post.comments) ? post.comments : {};
    const arr = Object.entries(comments).map(([id, c]) => ({ id, ...(c || {}) }))
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    container.innerHTML = ""; // clear
    // comments list
    for (const c of arr) {
      const d = document.createElement("div");
      d.className = "comment";
      d.innerHTML = `
        <span class="comment-author">${escapeHtml(c.author)}</span>: 
        <span class="comment-text" data-id="${escapeHtml(c.id)}">${escapeHtml(c.text)}</span>
        <div class="comment-time">${escapeHtml(new Date(c.createdAt).toLocaleString())}</div>
      `;
      if (c.author === currentUser()) {
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.className = "comment-edit-btn";
        editBtn.addEventListener("click", () => editComment(postId, c.id, c.text));
        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.className = "comment-delete-btn";
        delBtn.addEventListener("click", () => deleteComment(postId, c.id));
        d.appendChild(editBtn);
        d.appendChild(delBtn);
      }
      container.appendChild(d);
    }

    // input
    const inputWrap = document.createElement("div");
    inputWrap.className = "comment-input";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 300;
    input.placeholder = "Add a comment...";
    input.className = "comment-text-input";
    const btn = document.createElement("button");
    btn.className = "btn comment-post";
    btn.textContent = "Post";
    btn.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) return;
      await addComment(postId, text);
      input.value = "";
      await renderComments(postId);
      // update counts in UI without full reload
      const p = await feedDB.get(`posts/${postId}`);
      if (p) {
        postsCache[postId] = p;
        updatePostInPlace(p);
      }
    });
    inputWrap.appendChild(input);
    inputWrap.appendChild(btn);
    container.appendChild(inputWrap);

  } catch (err) {
    console.error("renderComments error", err);
    container.innerHTML = "<div class='error'>Failed to load comments</div>";
  }
}

async function addComment(postId, text) {
  try {
    const user = currentUser();
    const commentId = feedDB.generateId();
    const payload = {
      id: commentId,
      author: user,
      text,
      createdAt: new Date().toISOString()
    };
    // set single child
    await feedDB.set(`posts/${postId}/comments/${commentId}`, payload);
    // update local cache fast
    const p = postsCache[postId] || {};
    const comments = p.comments ? { ...p.comments } : {};
    comments[commentId] = payload;
    postsCache[postId] = { ...p, comments };
    updatePostInPlace(postsCache[postId]);
  } catch (err) {
    console.error("addComment error", err);
  }
}

async function editComment(postId, commentId, currentText) {
  const newText = prompt("Edit your comment:", currentText);
  if (newText === null) return;
  try {
    await feedDB.set(`posts/${postId}/comments/${commentId}/text`, newText);
    // reflect locally
    const p = postsCache[postId];
    if (p && p.comments && p.comments[commentId]) {
      p.comments[commentId].text = newText;
      updatePostInPlace(p);
      // if comments visible, re-render that comment list
      const refs = postElements[postId];
      if (refs && refs.commentsSection && refs.commentsSection.style.display !== "none") {
        await renderComments(postId);
      }
    }
  } catch (err) {
    console.error("editComment error", err);
  }
}

async function deleteComment(postId, commentId) {
  const ok = confirm("Delete this comment?");
  if (!ok) return;
  try {
    await feedDB.delete(`posts/${postId}/comments/${commentId}`);
    // update cache/UI
    const p = postsCache[postId];
    if (p && p.comments) {
      delete p.comments[commentId];
      updatePostInPlace(p);
      if (postElements[postId] && postElements[postId].commentsSection && postElements[postId].commentsSection.style.display !== "none") {
        await renderComments(postId);
      }
    }
  } catch (err) {
    console.error("deleteComment error", err);
  }
}

function toggleComments(postId) {
  const refs = postElements[postId];
  if (!refs) return;
  const container = refs.commentsSection;
  if (!container) return;
  if (container.style.display === "none" || container.style.display === "") {
    container.style.display = "block";
    renderComments(postId);
  } else {
    container.style.display = "none";
  }
}

// ---------- Create post ----------
(function wirePostButton() {
  const postBtn = document.getElementById("postBtn");
  const postTextEl = document.getElementById("postText");
  if (!postBtn || !postTextEl) return;

  postBtn.addEventListener("click", async () => {
    try {
      postBtn.disabled = true;
      const text = postTextEl.value.trim();
      const user = currentUser();
      if (!user) return alert("Not signed in");
      if (!text) return alert("Post must have text");

      const id = feedDB.generateId();
      const payload = {
        id,
        author: user,
        content: text,
        likes: {},
        loves: {},
        comments: {},
        createdAt: new Date().toISOString()
      };

      await feedDB.set(`posts/${id}`, payload);

      // insert locally without full reload
      postsCache[id] = payload;
      const el = makePostElement(payload, usersCache[user]);
      if (feedPostsEl) feedPostsEl.insertBefore(el, feedPostsEl.firstChild);

      postTextEl.value = "";
    } catch (err) {
      console.error("create post failed", err);
      alert("Failed to create post");
    } finally {
      postBtn.disabled = false;
    }
  });
})();

// ---------- Delete post ----------
async function deletePost(postId) {
  const ok = confirm("Delete this post?");
  if (!ok) return;
  try {
    // soft delete
    await feedDB.set(`posts/${postId}/deleted`, true);
    await feedDB.push("/adminLogs", {
      action: "post_deleted",
      user: currentUser(),
      postId,
      timestamp: new Date().toISOString(),
    });
    // remove locally
    const refs = postElements[postId];
    if (refs && refs.container && refs.container.parentNode) refs.container.parentNode.removeChild(refs.container);
    delete postsCache[postId];
    delete postElements[postId];
  } catch (err) {
    console.error("deletePost error", err);
    alert("Delete failed");
  }
}

// ---------- Init + periodic refresh (lightweight) ----------
document.addEventListener("DOMContentLoaded", () => {
  try { checkAuth(); } catch (e) { console.warn("checkAuth missing", e); }
  loadFeed();
  // poll every 5s but no overlapping fetches
  setInterval(() => {
    if (!fetching && Date.now() - lastFetch > 3000) loadFeed();
  }, 5000);
});
