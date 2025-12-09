class FirebaseAPI {
  constructor(databaseUrl) {
    this.baseURL = databaseUrl.endsWith("/")
      ? databaseUrl
      : databaseUrl + "/";

    this.jsonHeaders = { "Content-Type": "application/json" };
  }

  // Core request method (centralized for efficiency)
  async request(path, options = {}) {
    const url = `${this.baseURL}${path}.json`;

    try {
      const res = await fetch(url, options);
      if (!res.ok) return null; // avoid throwing, cheaper

      // Fastest way to handle no-body responses (DELETE)
      return res.status === 200 ? res.json() : true;
    } catch {
      return null;
    }
  }

  // CRUD wrappers
  get(path) {
    return this.request(path);
  }

  set(path, data) {
    return this.request(path, {
      method: "PUT",
      headers: this.jsonHeaders,
      body: JSON.stringify(data),
    });
  }

  push(path, data) {
    return this.request(path, {
      method: "POST",
      headers: this.jsonHeaders,
      body: JSON.stringify(data),
    });
  }

  delete(path) {
    return this.request(path, { method: "DELETE" });
  }

  // Efficient ID generator
  generateId() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    );
  }
}

const db = new FirebaseAPI(
  "https://parthsocialhack-default-rtdb.firebaseio.com/"
);
