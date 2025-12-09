// ==========================================
// REAL Firebase DB + Auth Check
// ==========================================
const profiledb = new FirebaseAPI("https://parthsocial-2f4bb-default-rtdb.firebaseio.com/")

function checkAuth() {
  const token = localStorage.getItem("authToken")
  const username = localStorage.getItem("username")
  if (!token || !username) window.location.href = "index.html"
}

// ==========================================
// Get username to display:
// If ?user=username exists → view OTHER profile
// Otherwise → load your own
// ==========================================
function getProfileUser() {
  const params = new URLSearchParams(window.location.search)
  return params.get("user") || localStorage.getItem("username")
}

// ==========================================
// Load Profile
// ==========================================
async function loadProfile() {
  const viewingUser = getProfileUser()
  const currentUser = localStorage.getItem("username")

  let user = await profiledb.get(`/users/${viewingUser}`)

  // If user does not exist, create basic placeholder
  if (!user) {
    user = { bio: "", avatar: "", createdAt: new Date().toISOString() }
    await profiledb.set(`/users/${viewingUser}`, user)
  }

  // Fill UI
  document.getElementById("username").textContent = viewingUser
  document.getElementById("bio").value = user.bio || ""

  if (user.avatar) {
    document.getElementById("avatar").innerHTML =
      `<img src="data:image/jpeg;base64,${user.avatar}" alt="avatar">`
  }

  // ==============================
  // Hide editing tools if viewing someone else
  // ==============================
  const isOwnProfile = viewingUser === currentUser

  document.getElementById("bio").disabled = !isOwnProfile
  document.getElementById("saveBioBtn").style.display = isOwnProfile ? "block" : "none"
  document.getElementById("uploadAvatarBtn").style.display = isOwnProfile ? "block" : "none"
  document.getElementById("avatarFile").style.display = isOwnProfile ? "block" : "none"
}

// ==========================================
// Upload New Avatar
// ==========================================
document.getElementById("uploadAvatarBtn").addEventListener("click", () => {
  document.getElementById("avatarFile").click()
})

document.getElementById("avatarFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (event) => {
    const base64 = event.target.result.split(",")[1]
    const currentUser = localStorage.getItem("username")

    let user = await profiledb.get(`/users/${currentUser}`)
    if (!user) user = {}

    user.avatar = base64
    await profiledb.set(`/users/${currentUser}`, user)

    document.getElementById("avatar").innerHTML =
      `<img src="data:image/jpeg;base64,${base64}" alt="avatar">`

    await profiledb.push("/adminLogs", {
      action: "avatar_updated",
      user: currentUser,
      timestamp: new Date().toISOString(),
    })
  }

  reader.readAsDataURL(file)
})

// ==========================================
// Save Bio
// ==========================================
document.getElementById("saveBioBtn").addEventListener("click", async () => {
  const currentUser = localStorage.getItem("username")
  const bio = document.getElementById("bio").value

  let user = await profiledb.get(`/users/${currentUser}`)
  if (!user) user = {}

  user.bio = bio
  await profiledb.set(`/users/${currentUser}`, user)

  const msg = document.getElementById("profileMessage")
  msg.textContent = "Bio updated!"

  setTimeout(() => (msg.textContent = ""), 2000)

  await profiledb.push("/adminLogs", {
    action: "bio_updated",
    user: currentUser,
    timestamp: new Date().toISOString(),
  })
})

// ==========================================
// Init
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  checkAuth()
  loadProfile()
})
