const pages = [
  { name: "Feed", href: "feed.html", id: "feed" },
  { name: "Messages", href: "dm.html", id: "dm" },
  { name: "Groups", href: "groups.html", id: "groups" },
  { name: "Profile", href: "profile.html", id: "profile" },
];

function renderSidebar() {
  const nav = document.getElementById("sidebarNav");
  const currentPage =
    window.location.pathname.split("/").pop() || "index.html";

  const username = localStorage.getItem("username"); // ALWAYS READ HERE

  let html = "";

  // Main pages
  pages.forEach((page) => {
    const isActive = currentPage === page.href;
    html += `<a href="${page.href}" class="${
      isActive ? "active" : ""
    }">${page.name}</a>`;
  });


  // Logout
  html += `<a href="#" onclick="logout()" id="logoutBtn">Logout</a>`;

  nav.innerHTML = html;
}

function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("username");
  window.location.href = "index.html";
}

function checkAuth() {
  const token = localStorage.getItem("authToken");
  if (!token) window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  if (
    window.location.pathname !== "/" &&
    !window.location.pathname.includes("index.html")
  ) {
    checkAuth();
  }

  renderSidebar();

  const sidebarToggle = document.querySelector(".sidebar-toggle");
  const sidebar = document.querySelector(".sidebar");

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("active");
    });
  }
});
