// =========================================
// auth.js — PASSWORDS (NO HASHING VERSION)
// =========================================

// sha256 and FirebaseAPI may be loaded, but no longer used

const loginForm = document.getElementById("loginForm")
const signupForm = document.getElementById("signupForm")
const loginBtn = document.getElementById("loginBtn")
const signupBtn = document.getElementById("signupBtn")

// Switch to login
loginBtn.addEventListener("click", () => {
  loginForm.classList.add("active")
  signupForm.classList.remove("active")
  loginBtn.classList.add("active")
  signupBtn.classList.remove("active")
})

// Switch to signup
signupBtn.addEventListener("click", () => {
  signupForm.classList.add("active")
  loginForm.classList.remove("active")
  signupBtn.classList.add("active")
  loginBtn.classList.remove("active")
})

/* ==========================
   LOGIN — plain passwords
========================== */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const username = document.getElementById("loginUsername").value.trim()
  const password = document.getElementById("loginPassword").value
  const errorDiv = document.getElementById("loginError")

  errorDiv.textContent = ""

  try {
    const userData = await db.get(`/users/${username}`)

    if (!userData) {
      errorDiv.textContent = "Invalid username or password"
      return
    }

    // DIRECT PASSWORD CHECK (no hashing)
    if (userData.passwordHash !== password) {
      errorDiv.textContent = "Invalid username or password"
      return
    }

    const token = db.generateId()

    await db.set(`/sessions/${token}`, {
      username,
      createdAt: new Date().toISOString()
    })

    localStorage.setItem("authToken", token)
    localStorage.setItem("username", username)

    window.location.href = "feed.html"
  } catch (err) {
    errorDiv.textContent = "Login failed. Try again."
  }
})

/* ==========================
   SIGNUP — store plain password
========================== */
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const username = document.getElementById("signupUsername").value.trim()
  const password = document.getElementById("signupPassword").value
  const errorDiv = document.getElementById("signupError")

  errorDiv.textContent = ""

  try {
    const exists = await db.get(`/users/${username}`)

    if (exists) {
      errorDiv.textContent = "Username already taken"
      return
    }

    // store plain password, but keep field name `passwordHash`
    await db.set(`/users/${username}`, {
      username,
      passwordHash: password,
      bio: "",
      avatar: "",
      createdAt: new Date().toISOString()
    })

    const token = db.generateId()

    await db.set(`/sessions/${token}`, {
      username,
      createdAt: new Date().toISOString()
    })

    localStorage.setItem("authToken", token)
    localStorage.setItem("username", username)

    window.location.href = "feed.html"
  } catch (err) {
    errorDiv.textContent = "Signup failed."
  }
})

/* ==========================
   AUTO-REDIRECT IF LOGGED IN
========================== */
if (localStorage.getItem("authToken")) {
  window.location.href = "feed.html"
}
