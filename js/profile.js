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
function compressImage(file, maxSize = 128, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      // Create canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });

      let w = img.width;
      let h = img.height;

      // Scale down
      if (w > h) {
        if (w > maxSize) {
          h *= maxSize / w;
          w = maxSize;
        }
      } else {
        if (h > maxSize) {
          w *= maxSize / h;
          h = maxSize;
        }
      }

      canvas.width = w;
      canvas.height = h;

      ctx.drawImage(img, 0, 0, w, h);

      // Output compressed JPEG
      const data = canvas.toDataURL("image/jpeg", quality);
      const base64 = data.split(",")[1];

      resolve(base64);
    };

    reader.readAsDataURL(file);
  });
}

/* =======================================================
   Upload Avatar (SUPER COMPRESSED)
========================================================= */
document.getElementById("uploadAvatarBtn").addEventListener("click", () => {
  document.getElementById("avatarFile").click();
});

document.getElementById("avatarFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Compress heavily
  const base64 = await compressImage(file, 128, 0.6);
  const currentUser = localStorage.getItem("username");

  // Update user avatar in DB
  await profiledb.set(`/users/${currentUser}/avatar`, base64);

  // Update UI instantly
  document.getElementById("avatar").innerHTML = `
    <img src="data:image/jpeg;base64,${base64}" alt="avatar">
  `;

  // Admin log
  await profiledb.push("/adminLogs", {
    action: "avatar_updated",
    user: currentUser,
    timestamp: new Date().toISOString(),
  });
});

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
