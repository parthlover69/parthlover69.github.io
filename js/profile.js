// ========================================================
// profile.js — ULTRA OPTIMIZED VERSION WITH AVATAR COMPRESSION
// ========================================================

const profiledb = new FirebaseAPI(
  "https://parthsocialhack-default-rtdb.firebaseio.com/"
);

function checkAuth() {
  const token = localStorage.getItem("authToken");
  const username = localStorage.getItem("username");
  if (!token || !username) window.location.href = "index.html";
}

/* =======================================================
   Determine which profile to load (yours or ?user=someone)
========================================================= */
function getProfileUser() {
  const params = new URLSearchParams(window.location.search);
  return params.get("user") || localStorage.getItem("username");
}

/* =======================================================
   Load Profile
========================================================= */
async function loadProfile() {
  const viewingUser = getProfileUser();
  const currentUser = localStorage.getItem("username");

  let user = await profiledb.get(`/users/${viewingUser}`);

  if (!user) {
    user = { bio: "", avatar: "", createdAt: new Date().toISOString() };
    await profiledb.set(`/users/${viewingUser}`, user);
  }

  document.getElementById("username").textContent = viewingUser;
  document.getElementById("bio").value = user.bio || "";

  if (user.avatar) {
    document.getElementById("avatar").innerHTML = `
      <img src="data:image/jpeg;base64,${user.avatar}" alt="avatar">
    `;
  }

  const isOwn = currentUser === viewingUser;

  document.getElementById("bio").disabled = !isOwn;
  document.getElementById("saveBioBtn").style.display = isOwn ? "block" : "none";
  document.getElementById("uploadAvatarBtn").style.display = isOwn ? "block" : "none";
  document.getElementById("avatarFile").style.display = isOwn ? "block" : "none";
}

/* =======================================================
   IMAGE COMPRESSION UTILITIES — THE MAGIC SAUCE
========================================================= */

// Resize + compress image using <canvas>
// ==========================================
// SUPER LIGHTWEIGHT AVATAR COMPRESSION
// ==========================================
async function compressImageToWebP(file, maxSize = 64) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        // 1. Create canvas capped at small resolution
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")

        // Resize to square maxSize × maxSize
        const size = maxSize
        canvas.width = size
        canvas.height = size

        // Draw image scaled
        ctx.drawImage(img, 0, 0, size, size)

        // 2. Export to WebP (super tiny)
        const compressed = canvas.toDataURL("image/webp", 0.4) 
        // 0.4 quality makes ~3–7 KB images

        resolve(compressed.split(",")[1]) // return base64 only
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  })
}


/* =======================================================
   Upload Avatar (SUPER COMPRESSED)
========================================================= */
document.getElementById("avatarFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]
  if (!file) return

  // 🔥 compress to extremely small WebP
  const compressedBase64 = await compressImageToWebP(file, 64)

  const currentUser = localStorage.getItem("username")
  let user = await profiledb.get(`/users/${currentUser}`)
  if (!user) user = {}

  user.avatar = compressedBase64
  await profiledb.set(`/users/${currentUser}`, user)

  document.getElementById("avatar").innerHTML =
    `<img src="data:image/webp;base64,${compressedBase64}" alt="avatar">`

  await profiledb.push("/adminLogs", {
    action: "avatar_updated",
    user: currentUser,
    timestamp: new Date().toISOString(),
  })
})


/* =======================================================
   Save Bio
========================================================= */
document.getElementById("saveBioBtn").addEventListener("click", async () => {
  const currentUser = localStorage.getItem("username");
  const bio = document.getElementById("bio").value.trim();

  await profiledb.set(`/users/${currentUser}/bio`, bio);

  const msg = document.getElementById("profileMessage");
  msg.textContent = "Bio updated!";
  setTimeout(() => (msg.textContent = ""), 1500);

  await profiledb.push("/adminLogs", {
    action: "bio_updated",
    user: currentUser,
    timestamp: new Date().toISOString(),
  });
});

/* =======================================================
   Init
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  loadProfile();
});
