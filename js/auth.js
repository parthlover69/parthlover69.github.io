// ========================================================
// auth.js — OPTIMIZED VERSION (PLAIN PASSWORDS, NO HASHING)
// ========================================================

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");

// ========================================================
// SECTION: UI SWITCHING
// ========================================================
function showLogin() {
  loginForm.classList.add("active");
  signupForm.classList.remove("active");
  loginBtn.classList.add("active");
  signupBtn.classList.remove("active");
}

function showSignup() {
  signupForm.classList.add("active");
  loginForm.classList.remove("active");
  signupBtn.classList.add("active");
  loginBtn.classList.remove("active");
}

loginBtn.addEventListener("click", showLogin);
signupBtn.addEventListener("click", showSignup);

// ========================================================
// SECTION: LOGIN — direct password comparison
// ========================================================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorDiv = document.getElementById("loginError");

  errorDiv.textContent = "";

  if (!username || !password) {
    errorDiv.textContent = "All fields required.";
    return;
  }

  try {
    const userData = await db.get(`/users/${username}`);

    if (!userData || userData.passwordHash !== password) {
      errorDiv.textContent = "Invalid username or password";
      return;
    }

    // create session token
    const token = db.generateId();
    await db.set(`/sessions/${token}`, {
      username,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem("authToken", token);
    localStorage.setItem("username", username);

    window.location.href = "feed.html";
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    errorDiv.textContent = "Login failed. Try again.";
  }
});

// ========================================================
// SECTION: SIGNUP — store plain password
// ========================================================
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;
  const errorDiv = document.getElementById("signupError");

  errorDiv.textContent = "";

  if (!username || !password) {
    errorDiv.textContent = "All fields required.";
    return;
  }

  try {
    const exists = await db.get(`/users/${username}`);

    if (exists) {
      errorDiv.textContent = "Username already taken";
      return;
    }

    await db.set(`/users/${username}`, {
      username,
      passwordHash: password, // still plain text, as requested
      bio: "",
      avatar: "",
      createdAt: new Date().toISOString(),
    });

    const token = db.generateId();
    await db.set(`/sessions/${token}`, {
      username,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem("authToken", token);
    localStorage.setItem("username", username);

    window.location.href = "feed.html";
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    errorDiv.textContent = "Signup failed.";
  }
});

// ========================================================
// AUTO-REDIRECT IF ALREADY LOGGED IN
// ========================================================
(function autoRedirect() {
  if (localStorage.getItem("authToken")) {
    window.location.href = "feed.html";
  }
})();
