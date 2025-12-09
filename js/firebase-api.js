class FirebaseAPI {
  constructor(databaseUrl) {
    this.baseURL = databaseUrl
  }

  async get(path) {
    try {
      const response = await fetch(`${this.baseURL}${path}.json`)
      if (!response.ok) throw new Error("Failed to fetch")
      return await response.json()
    } catch (error) {
      console.error("Firebase GET error:", error)
      return null
    }
  }

  async set(path, data) {
    try {
      const response = await fetch(`${this.baseURL}${path}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error("Failed to set")
      return await response.json()
    } catch (error) {
      console.error("Firebase SET error:", error)
      return null
    }
  }

  async push(path, data) {
    try {
      const response = await fetch(`${this.baseURL}${path}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error("Failed to push")
      return await response.json()
    } catch (error) {
      console.error("Firebase PUSH error:", error)
      return null
    }
  }

  async delete(path) {
    try {
      const response = await fetch(`${this.baseURL}${path}.json`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Failed to delete")
      return true
    } catch (error) {
      console.error("Firebase DELETE error:", error)
      return false
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
}

const db = new FirebaseAPI("https://parthsocial-2f4bb-default-rtdb.firebaseio.com/")
