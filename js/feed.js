// js/feed.js
// Uses a FirebaseAPI class from js/firebase-api.js
// Important: this file intentionally uses feedDB to avoid global 'db' collisions.

const FEED_DB_URL = "https://parthsocial-2f4bb-default-rtdb.firebaseio.com/";

// single instance for this file
const feedDB = new FirebaseAPI(FEED_DB_URL);

// --------- Auth ----------
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

// --------- Utilities ----------
function escapeHtml(t = "") {
  return String(t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

// normalize avatar value to usable image src
function avatarToSrc(avatarValue) {
  if (!avatarValue) return null;
  // If full data URL saved
  if (typeof avatarValue === "string" && avatarValue.startsWith("data:")) return avatarValue;
  // If payload (base64) saved: wrap with generic mime
  if (typeof avatarValue === "string") return `data:image/*;base64,${avatarValue}`;
  return null;
}

// --------- Modal & Menu State ----------
const postModal = document.getElementById("postModal");
const modalText = document.getElementById("modalText");
const modalClose = document.getElementById("modalClose");
const modalSave = document.getElementById("modalSave");
const modalDelete = document.getElementById("modalDelete");
const modalAuthor = document.getElementById("modalAuthor");

let editingPostId = null;

function openModal(postId, initialText, authorName, authorAvatarSrc) {
  editingPostId = postId;
  modalText.value = initialText || "";
  modalAuthor.innerHTML = `<img src="${authorAvatarSrc || ''}" class="avatar-sm" onerror="this.style.display='none'"> <span class="modal-author-name">${escapeHtml(authorName)}</span>`;

  postModal.classList.remove("hidden");
  postModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  editingPostId = null;
  modalText.value = "";
  postModal.classList.add("hidden");
  postModal.setAttribute("aria-hidden", "true");
}

modalClose.addEventListener("click", closeModal);

// save edited content
modalSave.addEventListener("click", async () => {
  if (!editingPostId) return;
  try {
    const newText = modalText.value.trim();
    await feedDB.set(`posts/${editingPostId}/content`, newText);
    closeModal();
    await loadFeed(); // refresh
  } catch (err) {
    console.error("modalSave error", err);
    alert("Failed to save post.");
  }
});

// delete post
async function deletePost(postId) {
  const ok = confirm("Delete this post?");
  if (!ok) return;
  try {
    // soft delete
    await feedDB.set(`posts/${postId}/deleted`, true);
    await feedDB.push("/adminLogs", {
      action: "post_deleted",
      user: localStorage.getItem("username"),
      postId,
      timestamp: new Date().toISOString(),
    });
    await loadFeed();
  } catch (err) {
    console.error("deletePost error", err);
    alert("Delete failed");
  }
}

modalDelete.addEventListener("click", async () => {
  if (!editingPostId) return;
  await deletePost(editingPostId);
  closeModal();
});

// --------- Menu helper ----------
function openMenuForPost(buttonEl, post, authorData) {
  // close any other menus
  document.querySelectorAll(".post-menu").forEach(m => m.remove());

  const tpl = document.getElementById("menuTemplate");
  const clone = tpl.content.cloneNode(true);
  const menu = clone.querySelector(".post-menu");
  // attach actions to menu items
  const editBtn = menu.querySelector(".menu-item.edit");
  const deleteBtn = menu.querySelector(".menu-item.delete");

  // show Edit only if current user is author
  const currentUser = localStorage.getItem("username");
  if (post.author !== currentUser) {
    editBtn.style.display = "none";
    deleteBtn.style.display = "none";
  }

  editBtn.addEventListener("click", () => {
    const avatarSrc = authorData ? avatarToSrc(authorData.avatar) : null;
    openModal(post.id, post.content, post.author, avatarSrc);
    menu.remove();
  });

  deleteBtn.addEventListener("click", async () => {
    menu.remove();
    await deletePost(post.id);
  });

  // position menu near button
  document.body.appendChild(menu);
  const rect = buttonEl.getBoundingClientRect();
  menu.style.position = "absolute";
  menu.style.left = `${rect.right - 140}px`;
  menu.style.top = `${rect.bottom + 6}px`;

  // click outside to close
  setTimeout(() => {
    function docClick(ev) {
      if (!menu.contains(ev.target) && ev.target !== buttonEl) {
        menu.remove();
        document.removeEventListener("click", docClick);
      }
    }
    document.addEventListener("click", docClick);
  }, 0);
}

// --------- Feed rendering ----------
async function loadFeed() {
  try {
    // collect posts + users so we can show avatars + nice names
    const [rawPosts, rawUsers] = await Promise.all([
      feedDB.get("posts"),
      feedDB.get("users")
    ]);

    const feedPosts = document.getElementById("feedPosts");
    if (!feedPosts) return;
    feedPosts.innerHTML = "";

    if (!rawPosts) {
      feedPosts.innerHTML = `<div class="empty">No posts yet — be the first!</div>`;
      return;
    }

    const postsArray = Object.entries(rawPosts || {})
      .map(([id, data]) => ({ id, ...(data || {}) }))
      .filter(p => !p.deleted)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    for (const post of postsArray) {
      const author = post.author || post.username || "unknown";
      const authorData = rawUsers ? rawUsers[author] : null;
      const authorAvatarSrc = authorData ? avatarToSrc(authorData.avatar) : null;

      const postEl = createPostElement(post, { avatarSrc: authorAvatarSrc, authorData });
      feedPosts.appendChild(postEl);
    }
  } catch (err) {
    console.error("loadFeed error", err);
  }
}

function createPostElement(post, { avatarSrc = null, authorData = null } = {}) {
  const div = document.createElement("div");
  div.className = "post";

  const currentUser = localStorage.getItem("username") || "";
  const ts = post.createdAt ? new Date(post.createdAt).toLocaleString() : "";

  // author block with small avatar
  const avatarHtml = avatarSrc ? `<img src="${avatarSrc}" class="avatar-sm" alt="pfp">` : `<div class="avatar-sm placeholder"></div>`;
  const authorHtml = `<div class="author-block">${avatarHtml}<a class="post-author-link" href="profile.html?user=${encodeURIComponent(post.author)}">${escapeHtml(post.author)}</a></div>`;

  // content
  const contentHtml = `<div class="post-content">${escapeHtml(post.content || "")}</div>`;

  // actions
  const likes = post.likes ? Object.keys(post.likes).length : 0;
  const loves = post.loves ? Object.keys(post.loves).length : 0;
  const commentsCount = post.comments ? Object.keys(post.comments).length : 0;
  const likedClass = post.likes && post.likes[currentUser] ? "active" : "";
  const lovedClass = post.loves && post.loves[currentUser] ? "active" : "";

  div.innerHTML = `
    <div class="post-header">
      <div class="post-left">${authorHtml}</div>
      <div class="post-right">
        <div class="post-time">${escapeHtml(ts)}</div>
        <button class="menu-btn" aria-label="menu">⋯</button>
      </div>
    </div>

    ${contentHtml}

    <div class="post-actions">
      <button class="post-action-btn like-btn ${likedClass}" data-id="${escapeHtml(post.id)}">👍 <span class="count">${likes}</span></button>
      <button class="post-action-btn love-btn ${lovedClass}" data-id="${escapeHtml(post.id)}">❤️ <span class="count">${loves}</span></button>
      <button class="post-action-btn comments-toggle" data-id="${escapeHtml(post.id)}">💬 ${commentsCount}</button>
    </div>

    <div class="comments-section" id="comments-${escapeHtml(post.id)}" style="display:none;"></div>
  `;

  // attach action listeners
  const likeBtn = div.querySelector(".like-btn");
  const loveBtn = div.querySelector(".love-btn");
  const commentsToggle = div.querySelector(".comments-toggle");
  const menuBtn = div.querySelector(".menu-btn");

  if (likeBtn) likeBtn.addEventListener("click", () => toggleLike(post.id));
  if (loveBtn) loveBtn.addEventListener("click", () => toggleLove(post.id));
  if (commentsToggle) commentsToggle.addEventListener("click", () => toggleComments(post.id));
  if (menuBtn) menuBtn.addEventListener("click", (e) => openMenuForPost(menuBtn, post, authorData));

  return div;
}

// --------- Reactions ----------
async function toggleLike(postId) {
  try {
    const user = localStorage.getItem("username");
    const post = await feedDB.get(`posts/${postId}`);
    if (!post) return;
    if (!post.likes) post.likes = {};
    if (post.likes[user]) delete post.likes[user];
    else post.likes[user] = true;
    await feedDB.set(`posts/${postId}/likes`, post.likes);
    await loadFeed();
  } catch (err) {
    console.error("toggleLike error", err);
  }
}

async function toggleLove(postId) {
  try {
    const user = localStorage.getItem("username");
    const post = await feedDB.get(`posts/${postId}`);
    if (!post) return;
    if (!post.loves) post.loves = {};
    if (post.loves[user]) delete post.loves[user];
    else post.loves[user] = true;
    await feedDB.set(`posts/${postId}/loves`, post.loves);
    await loadFeed();
  } catch (err) {
    console.error("toggleLove error", err);
  }
}

// --------- Comments ----------
async function renderComments(postId, container) {
  container.innerHTML = "<div class='loading'>Loading comments…</div>";
  try {
    const post = await feedDB.get(`posts/${postId}`);
    const comments = (post && post.comments) ? post.comments : {};
    const commentArr = Object.entries(comments || {}).map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    container.innerHTML = "";

    commentArr.forEach((c) => {
      const d = document.createElement("div");
      d.className = "comment";
      d.innerHTML = `
        <span class="comment-author">${escapeHtml(c.author)}</span>: 
        <span class="comment-text" data-id="${escapeHtml(c.id)}">${escapeHtml(c.text)}</span>
        <div class="comment-time">${escapeHtml(new Date(c.createdAt).toLocaleString())}</div>
      `;

      // allow edit/delete for comment author
      if (c.author === localStorage.getItem("username")) {
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
    });

    // input
    const inputWrap = document.createElement("div");
    inputWrap.className = "comment-input";
    inputWrap.innerHTML = `<input type="text" class="comment-text-input" placeholder="Add a comment..." maxlength="300"><button class="btn comment-post">Post</button>`;
    const input = inputWrap.querySelector(".comment-text-input");
    const btn = inputWrap.querySelector(".comment-post");
    btn.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) return;
      await addComment(postId, text);
      input.value = "";
      await renderComments(postId, container);
      await loadFeed(); // refresh counts
    });

    container.appendChild(inputWrap);
  } catch (err) {
    console.error("renderComments error", err);
    container.innerHTML = "<div class='error'>Failed to load comments</div>";
  }
}

async function addComment(postId, text) {
  try {
    const user = localStorage.getItem("username");
    const commentId = feedDB.generateId();
    await feedDB.set(`posts/${postId}/comments/${commentId}`, {
      id: commentId,
      author: user,
      text,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("addComment error", err);
  }
}

async function editComment(postId, commentId, currentText) {
  const newText = prompt("Edit your comment:", currentText);
  if (newText === null) return;
  try {
    await feedDB.set(`posts/${postId}/comments/${commentId}/text`, newText);
    await loadFeed();
  } catch (err) {
    console.error("editComment error", err);
  }
}

async function deleteComment(postId, commentId) {
  const ok = confirm("Delete this comment?");
  if (!ok) return;
  try {
    await feedDB.delete(`posts/${postId}/comments/${commentId}`);
    await loadFeed();
  } catch (err) {
    console.error("deleteComment error", err);
  }
}

async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (!section) return;
  if (section.style.display === "none" || section.style.display === "") {
    section.style.display = "block";
    await renderComments(postId, section);
  } else {
    section.style.display = "none";
  }
}

// --------- Create post ----------
(function wirePostButton() {
  const postBtn = document.getElementById("postBtn");
  const postTextEl = document.getElementById("postText");
  if (!postBtn || !postTextEl) return;

  postBtn.addEventListener("click", async () => {
    try {
      postBtn.disabled = true;
      const text = postTextEl.value.trim();
      const user = localStorage.getItem("username");
      if (!user) {
        alert("Not signed in");
        return;
      }
      if (!text) {
        alert("Post must have text");
        return;
      }
      const id = feedDB.generateId();
      const payload = {
        id,
        author: user,
        content: text,
        likes: {},
        loves: {},
        comments: {},
        createdAt: new Date().toISOString(),
      };
      await feedDB.set(`posts/${id}`, payload);
      // reset form
      postTextEl.value = "";
      await loadFeed();
    } catch (err) {
      console.error("create post failed", err);
      alert("Failed to create post");
    } finally {
      postBtn.disabled = false;
    }
  });
})();

// --------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  try { checkAuth(); } catch (e) { console.warn("checkAuth missing", e); }
  loadFeed();
  setInterval(loadFeed, 5000);
});
