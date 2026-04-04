const API_BASE =
  typeof window !== "undefined" && window.location?.protocol === "file:"
    ? "http://127.0.0.1:8787/api"
    : "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

export const MongoApi = {
  async getSavedConnections() {
    return request("/connections");
  },

  async saveConnection(connection) {
    if (connection.id) {
      return request(`/connections/${connection.id}`, {
        method: "PUT",
        body: JSON.stringify(connection),
      });
    }

    return request("/connections", {
      method: "POST",
      body: JSON.stringify(connection),
    });
  },

  async removeConnection(connectionId) {
    return request(`/connections/${connectionId}`, {
      method: "DELETE",
    });
  },

  async testConnection(config) {
    return request("/connections/test", {
      method: "POST",
      body: JSON.stringify(config),
    });
  },

  async connect(configOrConnectionId) {
    const isId = typeof configOrConnectionId === "string";
    const saved = isId ? { id: configOrConnectionId } : await this.saveConnection(configOrConnectionId);
    return request(`/connections/${saved.id}/connect`, {
      method: "POST",
    });
  },

  async disconnect(connectionId) {
    return request(`/connections/${connectionId}/disconnect`, {
      method: "POST",
    });
  },

  async listDatabases(connectionId) {
    const query = new URLSearchParams({ connectionId });
    return request(`/databases?${query.toString()}`);
  },

  async listCollections(connectionId, dbName) {
    const query = new URLSearchParams({ connectionId });
    return request(`/databases/${encodeURIComponent(dbName)}/collections?${query.toString()}`);
  },

  async findDocuments(connectionId, dbName, collectionName, params = {}) {
    return request("/documents/find", {
      method: "POST",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        collection: collectionName,
        ...params,
      }),
    });
  },

  async getDocument(connectionId, dbName, collectionName, docId) {
    const query = new URLSearchParams({ connectionId });
    return request(
      `/documents/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}?${query.toString()}`
    );
  },

  async insertDocument(connectionId, dbName, collectionName, doc) {
    return request("/documents", {
      method: "POST",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        collection: collectionName,
        document: doc,
      }),
    });
  },

  async updateDocument(connectionId, dbName, collectionName, docId, update) {
    return request("/documents", {
      method: "PUT",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        collection: collectionName,
        docId,
        document: update,
      }),
    });
  },

  async deleteDocument(connectionId, dbName, collectionName, docId) {
    return request("/documents", {
      method: "DELETE",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        collection: collectionName,
        docId,
      }),
    });
  },

  async getIndexes(connectionId, dbName, collectionName) {
    const query = new URLSearchParams({ connectionId, database: dbName, collection: collectionName });
    return request(`/indexes?${query.toString()}`);
  },

  async executeAggregate(connectionId, dbName, collectionName, pipeline, stopAtStage = -1) {
    return request("/aggregate/execute", {
      method: "POST",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        collection: collectionName,
        pipeline,
        stopAtStage,
      }),
    });
  },

  async explainPipeline(connectionId, dbName, collectionName, pipeline) {
    return request("/aggregate/explain", {
      method: "POST",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        collection: collectionName,
        pipeline,
      }),
    });
  },

  async executeShellCommand(connectionId, dbName, command) {
    return request("/shell/execute", {
      method: "POST",
      body: JSON.stringify({
        connectionId,
        database: dbName,
        command,
      }),
    });
  },

  async createCollection(connectionId, dbName, collectionName) {
    return request(`/databases/${encodeURIComponent(dbName)}/collections`, {
      method: "POST",
      body: JSON.stringify({ connectionId, collectionName }),
    });
  },

  async dropCollection(connectionId, dbName, collectionName) {
    const query = new URLSearchParams({ connectionId });
    return request(`/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}?${query.toString()}`, {
      method: "DELETE",
    });
  },

  async getDatabaseStats(connectionId, dbName) {
    const query = new URLSearchParams({ connectionId });
    return request(`/databases/${encodeURIComponent(dbName)}/stats?${query.toString()}`);
  },

  async duplicateDatabase(connectionId, dbName, targetDatabase) {
    return request(`/databases/${encodeURIComponent(dbName)}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ connectionId, targetDatabase }),
    });
  },

  async dropDatabase(connectionId, dbName) {
    const query = new URLSearchParams({ connectionId });
    return request(`/databases/${encodeURIComponent(dbName)}?${query.toString()}`, {
      method: "DELETE",
    });
  },

  async getCollectionStats(connectionId, dbName, collectionName) {
    const query = new URLSearchParams({ connectionId });
    return request(
      `/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/stats?${query.toString()}`
    );
  },

  async renameCollection(connectionId, dbName, collectionName, newName) {
    return request(`/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/rename`, {
      method: "PUT",
      body: JSON.stringify({ connectionId, newName }),
    });
  },

  async wipeCollection(connectionId, dbName, collectionName) {
    const query = new URLSearchParams({ connectionId });
    return request(
      `/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/documents?${query.toString()}`,
      { method: "DELETE" }
    );
  },

  async duplicateCollection(connectionId, dbName, collectionName, targetCollection) {
    return request(`/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ connectionId, targetCollection }),
    });
  },

  async createIndex(connectionId, dbName, collectionName, keys, options = {}) {
    return request(`/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/indexes`, {
      method: "POST",
      body: JSON.stringify({ connectionId, keys, options }),
    });
  },

  async exportCollection(connectionId, dbName, collectionName, format = "json") {
    const query = new URLSearchParams({ connectionId, format });
    return request(
      `/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/export?${query.toString()}`
    );
  },

  async importCollection(connectionId, dbName, collectionName, format, payload, targetCollection) {
    return request(`/databases/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(collectionName)}/import`, {
      method: "POST",
      body: JSON.stringify({ connectionId, format, payload, targetCollection }),
    });
  },

  async exportDatabase(connectionId, dbName, format = "json") {
    const query = new URLSearchParams({ connectionId, format });
    return request(`/databases/${encodeURIComponent(dbName)}/export?${query.toString()}`);
  },

  async importDatabase(connectionId, dbName, payload, targetDatabase, format = "json") {
    return request(`/databases/${encodeURIComponent(dbName)}/import`, {
      method: "POST",
      body: JSON.stringify({ connectionId, payload, targetDatabase, format }),
    });
  },

  async getLlmSettings() {
    return request("/settings/llm");
  },

  async saveLlmSettings(settings) {
    return request("/settings/llm", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },

  async generateShellQuery(connectionId, database, collection, instruction) {
    return request("/llm/generate-query", {
      method: "POST",
      body: JSON.stringify({ connectionId, database, collection, instruction }),
    });
  },
};
