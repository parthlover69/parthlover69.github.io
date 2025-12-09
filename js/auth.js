// ===============================
// ELEMENTS
// ===============================
const loginForm = document.getElementById("loginForm"),
      signupForm = document.getElementById("signupForm"),
      loginBtn = document.getElementById("loginBtn"),
      signupBtn = document.getElementById("signupBtn");

// ===============================
// UI SWITCH
// ===============================
const toggle = (isLogin) => {
  loginForm.classList.toggle("active", isLogin);
  signupForm.classList.toggle("active", !isLogin);
  loginBtn.classList.toggle("active", isLogin);
  signupBtn.classList.toggle("active", !isLogin);
};

loginBtn.onclick = () => toggle(true);
signupBtn.onclick = () => toggle(false);

// ===============================
// AUTH HELPERS
// ===============================
async function startSession(username) {
  const token = db.generateId();
  await db.set(`/sessions/${token}`, { username, createdAt: new Date().toISOString() });
  localStorage.setItem("authToken", token);
  localStorage.setItem("username", username);
  window.location.href = "feed.html";
}

// ===============================
// LOGIN
// ===============================
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const u = loginUsername.value.trim(),
        p = loginPassword.value,
        err = loginError;

  err.textContent = "";
  if (!u || !p) return err.textContent = "All fields required.";

  const user = await db.get(`/users/${u}`);
  if (!user || user.passwordHash !== p) return err.textContent = "Invalid username or password";

  startSession(u);
};

// ===============================
// SIGNUP
// ===============================
signupForm.onsubmit = async (e) => {
  e.preventDefault();
  const u = signupUsername.value.trim(),
        p = signupPassword.value,
        err = signupError;

  err.textContent = "";
  if (!u || !p) return err.textContent = "All fields required.";

  if (await db.get(`/users/${u}`)) return err.textContent = "Username already taken";

  await db.set(`/users/${u}`, {
    username: u,
    passwordHash: p,
    bio: "",
    avatar: "",
    createdAt: new Date().toISOString()
  });

  startSession(u);
};

// ===============================
// AUTO-REDIRECT
// ===============================
if (localStorage.getItem("authToken")) window.location.href = "feed.html";
