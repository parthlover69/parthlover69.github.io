// ===============================
// ELEMENTS
// ===============================
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");

// Inputs + Errors
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const signupUsername = document.getElementById("signupUsername");
const signupPassword = document.getElementById("signupPassword");
const inviteCode = document.getElementById("inviteCode"); // Added invite code input
const signupError = document.getElementById("signupError");

// ===============================
// UI SWITCH — FIGMATIZED
// Smooth animated transitions
// ===============================
const toggle = (isLogin) => {
  loginForm.classList.toggle("active", isLogin);
  signupForm.classList.toggle("active", !isLogin);

  loginBtn.classList.toggle("active", isLogin);
  signupBtn.classList.toggle("active", !isLogin);

  // Add subtle animations
  loginForm.classList.add("fade-transition");
  signupForm.classList.add("fade-transition");
};

loginBtn.onclick = () => toggle(true);
signupBtn.onclick = () => toggle(false);

// ===============================
// AUTH HELPERS
// ===============================
async function startSession(username) {
  const token = db.generateId();

  await db.set(`/sessions/${token}`, {
    username,
    createdAt: new Date().toISOString(),
  });

  localStorage.setItem("authToken", token);
  localStorage.setItem("username", username);

  document.body.classList.add("fade-out");
  setTimeout(() => window.location.href = "feed.html", 180);
}

// ===============================
// LOGIN
// ===============================
loginForm.onsubmit = async (e) => {
  e.preventDefault();

  const u = loginUsername.value.trim();
  const p = loginPassword.value;
  const err = loginError;

  err.textContent = "";
  err.classList.remove("shake");

  if (!u || !p) {
    err.textContent = "All fields required.";
    err.classList.add("shake");
    return;
  }

  const user = await db.get(`/users/${u}`);
  if (!user || user.passwordHash !== p) {
    err.textContent = "Invalid username or password";
    err.classList.add("shake");
    return;
  }

  startSession(u);
};

// ===============================
// SIGNUP
// ===============================
signupForm.onsubmit = async (e) => {
  e.preventDefault();

  const u = signupUsername.value.trim();
  const p = signupPassword.value;
  const code = inviteCode.value.trim(); // Get invite code value
  const err = signupError;

  err.textContent = "";
  err.classList.remove("shake");

  if (!u || !p || !code) { // Check if invite code is provided
    err.textContent = "All fields required.";
    err.classList.add("shake");
    return;
  }

  // Validate invite code against database
  const inviteCodeData = await db.get(`/inviteCodes/${code}`);
  
  // Explicitly check if the returned value is null
  if (inviteCodeData === null) {
    err.textContent = "Invalid invite code";
    err.classList.add("shake");
    return;
  }

  // Check if invite code has already been used
  if (inviteCodeData.used === true) {
    err.textContent = "This invite code has already been used";
    err.classList.add("shake");
    return;
  }

  if (await db.get(`/users/${u}`)) {
    err.textContent = "Username already taken";
    err.classList.add("shake");
    return;
  }

  // Create the user
  await db.set(`/users/${u}`, {
    username: u,
    passwordHash: p,
    bio: "",
    avatar: "",
    createdAt: new Date().toISOString(),
    inviteCode: code, // Store the invite code with the user
  });

  // Mark the invite code as used
  await db.set(`/inviteCodes/${code}`, {
    ...inviteCodeData,
    used: true,
    usedBy: u,
    usedAt: new Date().toISOString()
  });

  startSession(u);
};

// ===============================
// AUTO-REDIRECT
// ===============================
if (localStorage.getItem("authToken")) {
  document.body.classList.add("fade-out");
  setTimeout(() => (window.location.href = "feed.html"), 180);
}
