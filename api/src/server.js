import cors from "cors";
import Database from "better-sqlite3";
import express from "express";
import { XMLParser } from "fast-xml-parser";
import JSON5 from "json5";
import { MongoClient, ObjectId } from "mongodb";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import XLSX from "xlsx";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.SQLITE_DIR || path.join(__dirname, "..", "data");
const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, "app.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  authDb TEXT,
  username TEXT,
  password TEXT,
  replicaSet TEXT,
  tls INTEGER DEFAULT 0,
  directConnection INTEGER DEFAULT 1,
  uri TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
`);

const upsertConnectionStmt = sqlite.prepare(`
INSERT INTO connections (
  id, name, host, port, authDb, username, password, replicaSet, tls, directConnection, uri, createdAt, updatedAt
) VALUES (
  @id, @name, @host, @port, @authDb, @username, @password, @replicaSet, @tls, @directConnection, @uri, @createdAt, @updatedAt
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  host = excluded.host,
  port = excluded.port,
  authDb = excluded.authDb,
  username = excluded.username,
  password = excluded.password,
  replicaSet = excluded.replicaSet,
  tls = excluded.tls,
  directConnection = excluded.directConnection,
  uri = excluded.uri,
  updatedAt = excluded.updatedAt
`);

function parseLooseJSON(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON5.parse(String(value));
  } catch {
    return fallback;
  }
}

function buildMongoUri(config) {
  if (config.uri && config.uri.trim()) return config.uri.trim();
  const host = config.host || "localhost";
  const port = Number(config.port || 27017);
  const authDb = config.authDb || "admin";
  const user = config.username ? encodeURIComponent(config.username) : "";
  const pass = config.password ? encodeURIComponent(config.password) : "";
  const auth = user ? `${user}:${pass}@` : "";
  const params = new URLSearchParams();
  if (config.replicaSet) params.set("replicaSet", config.replicaSet);
  if (config.directConnection !== undefined) params.set("directConnection", String(Boolean(config.directConnection)));
  if (config.tls) params.set("tls", "true");
  if (authDb) params.set("authSource", authDb);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `mongodb://${auth}${host}:${port}/${authDb}${suffix}`;
}

function normalizeConnection(row) {
  return {
    id: row.id,
    name: row.name,
    host: row.host || "",
    port: row.port || 27017,
    authDb: row.authDb || "admin",
    username: row.username || "",
    password: row.password || "",
    replicaSet: row.replicaSet || "",
    tls: Boolean(row.tls),
    directConnection: Boolean(row.directConnection),
    uri: row.uri || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function saveConnection(input) {
  const now = Date.now();
  const data = {
    id: input.id || `conn_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(input.name || "Unnamed Connection"),
    host: String(input.host || "localhost"),
    port: Number(input.port || 27017),
    authDb: String(input.authDb || "admin"),
    username: String(input.username || ""),
    password: String(input.password || ""),
    replicaSet: String(input.replicaSet || ""),
    tls: input.tls ? 1 : 0,
    directConnection: input.directConnection === false ? 0 : 1,
    uri: String(input.uri || ""),
    createdAt: now,
    updatedAt: now,
  };

  const existing = sqlite.prepare("SELECT createdAt FROM connections WHERE id = ?").get(data.id);
  if (existing?.createdAt) data.createdAt = existing.createdAt;

  upsertConnectionStmt.run(data);
  return normalizeConnection(sqlite.prepare("SELECT * FROM connections WHERE id = ?").get(data.id));
}

const clientRegistry = new Map();

async function getConnectedClientByConnectionId(connectionId) {
  const existing = clientRegistry.get(connectionId);
  if (existing?.client) return existing;

  const row = sqlite.prepare("SELECT * FROM connections WHERE id = ?").get(connectionId);
  if (!row) {
    const error = new Error(`Connection '${connectionId}' not found`);
    error.statusCode = 404;
    throw error;
  }

  const config = normalizeConnection(row);
  const uri = buildMongoUri(config);
  const client = new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    appName: "WebMongoGui",
  });

  await client.connect();
  await client.db(config.authDb || "admin").command({ ping: 1 });

  const entry = { client, uri, connectedAt: Date.now() };
  clientRegistry.set(connectionId, entry);
  return entry;
}

function toObjectIdMaybe(id) {
  if (typeof id === "string" && ObjectId.isValid(id) && String(new ObjectId(id)) === id) {
    return new ObjectId(id);
  }
  return id;
}

function encodeDocId(id) {
  if (id instanceof ObjectId) return id.toHexString();
  return id;
}

function serializeForJson(value) {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeForJson);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeForJson(v);
    return out;
  }
  return value;
}

function reviveMongoLiterals(value) {
  if (Array.isArray(value)) return value.map(reviveMongoLiterals);
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "__webmongoObjectId")) {
      const hex = String(value.__webmongoObjectId || "");
      if (ObjectId.isValid(hex)) return new ObjectId(hex);
      return value;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveMongoLiterals(v);
    return out;
  }
  return value;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const raw = row[header];
          const value = raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw) : raw;
          return csvEscape(value);
        })
        .join(",")
    ),
  ].join("\n");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

function csvToRows(payload) {
  const lines = String(payload || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] ?? "";
    });
    return row;
  });
}

function flattenAnyToDocs(value) {
  if (Array.isArray(value)) return value.flatMap(flattenAnyToDocs);
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const scalarCount = entries.filter(([, v]) => v == null || typeof v !== "object").length;
    if (entries.length > 0 && scalarCount === entries.length) return [value];
    return entries.flatMap(([, v]) => flattenAnyToDocs(v));
  }
  return [];
}

function parseSingleCollectionImport(payload, format) {
  if (format === "csv" || format === "excel") return csvToRows(payload);

  if (format === "xml") {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(String(payload || ""));
    return flattenAnyToDocs(parsed);
  }

  if (format === "xlsx") {
    const workbook = XLSX.read(Buffer.from(String(payload || ""), "base64"), { type: "buffer" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: null });
  }

  const parsed = parseLooseJSON(payload, []);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function parseDatabaseImportPayload(payload, format, fallbackCollection = "imported_data") {
  if (format === "json" || format === "bson") {
    const parsed = parseLooseJSON(payload, null);
    if (!parsed || typeof parsed !== "object") return null;
    const collectionsMap = parsed.collections && typeof parsed.collections === "object" ? parsed.collections : parsed;
    const out = {};
    for (const [name, docsRaw] of Object.entries(collectionsMap || {})) {
      if (Array.isArray(docsRaw)) out[name] = docsRaw;
    }
    return out;
  }

  const rows = parseSingleCollectionImport(payload, format);
  const grouped = {};

  rows.forEach((row) => {
    const collection = String(row?._collection || fallbackCollection).trim() || fallbackCollection;
    const next = { ...(row || {}) };
    delete next._collection;
    if (!grouped[collection]) grouped[collection] = [];
    grouped[collection].push(next);
  });

  return grouped;
}

function getRoleActionsByAccess(access) {
  if (access === "readWrite") {
    return [
      "find",
      "insert",
      "update",
      "remove",
      "listIndexes",
      "listCollections",
      "createIndex",
      "dropIndex",
      "collStats",
      "dbStats",
    ];
  }
  return ["find", "listIndexes", "listCollections", "collStats", "dbStats"];
}

async function upsertCollectionScopedRole(db, roleName, collectionName, access) {
  const privileges = [
    {
      resource: { db: db.databaseName, collection: collectionName },
      actions: getRoleActionsByAccess(access),
    },
  ];

  try {
    await db.command({
      createRole: roleName,
      privileges,
      roles: [],
    });
  } catch (error) {
    if (!String(error?.message || "").toLowerCase().includes("already exists")) throw error;
    await db.command({
      updateRole: roleName,
      privileges,
      roles: [],
    });
  }
}

function sanitizeRoleToken(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function parseShellCommand(command) {
  const trimmed = String(command || "").trim();
  const findMatch = trimmed.match(/^db\.([A-Za-z0-9_]+)\.find\((.*)\)$/s);
  if (findMatch) {
    const args = findMatch[2].trim();
    const [rawFilter = "{}", rawProjection] = splitTopLevelArgs(args);
    return {
      type: "find",
      collection: findMatch[1],
      filter: parseLooseJSON(rawFilter, {}),
      projection: rawProjection ? parseLooseJSON(rawProjection, {}) : {},
    };
  }

  const countMatch = trimmed.match(/^db\.([A-Za-z0-9_]+)\.countDocuments\((.*)\)$/s);
  if (countMatch) {
    return {
      type: "count",
      collection: countMatch[1],
      filter: parseLooseJSON(countMatch[2] || "{}", {}),
    };
  }

  const aggMatch = trimmed.match(/^db\.([A-Za-z0-9_]+)\.aggregate\((.*)\)$/s);
  if (aggMatch) {
    return {
      type: "aggregate",
      collection: aggMatch[1],
      pipeline: parseLooseJSON(aggMatch[2], []),
    };
  }

  return null;
}

function splitTopLevelArgs(argsStr) {
  const args = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let quote = "";

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];

    if (inString) {
      current += ch;
      if (ch === quote && argsStr[i - 1] !== "\\") {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    if (ch === "}" || ch === "]" || ch === ")") depth -= 1;

    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function clampLimit(limit, fallback = 50) {
  const n = Number(limit ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, 200));
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "webmongogui-api" });
});

app.get("/api/connections", (_req, res) => {
  const rows = sqlite.prepare("SELECT * FROM connections ORDER BY updatedAt DESC").all();
  res.json(rows.map(normalizeConnection));
});

app.post("/api/connections", (req, res) => {
  const saved = saveConnection(req.body || {});
  res.status(201).json(saved);
});

app.put("/api/connections/:id", (req, res) => {
  const saved = saveConnection({ ...(req.body || {}), id: req.params.id });
  res.json(saved);
});

app.delete("/api/connections/:id", async (req, res) => {
  sqlite.prepare("DELETE FROM connections WHERE id = ?").run(req.params.id);
  const active = clientRegistry.get(req.params.id);
  if (active?.client) {
    try {
      await active.client.close();
    } catch {
      // ignore close errors
    }
    clientRegistry.delete(req.params.id);
  }
  res.json({ ok: true });
});

app.post("/api/connections/test", async (req, res, next) => {
  try {
    const uri = buildMongoUri(req.body || {});
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
    const start = Date.now();
    await client.connect();
    const adminDb = client.db((req.body && req.body.authDb) || "admin");
    const result = await adminDb.command({ ping: 1 });
    await client.close();

    res.json({
      ok: result.ok === 1,
      version: result.version || "unknown",
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/connections/:id/connect", async (req, res, next) => {
  try {
    const saved = sqlite.prepare("SELECT * FROM connections WHERE id = ?").get(req.params.id);
    if (!saved) return res.status(404).json({ error: "Connection not found" });

    const entry = await getConnectedClientByConnectionId(req.params.id);
    const conn = normalizeConnection(saved);
    res.json({
      ok: true,
      host: conn.host,
      port: conn.port,
      sessionId: req.params.id,
      connectedAt: entry.connectedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/connections/:id/disconnect", async (req, res) => {
  const active = clientRegistry.get(req.params.id);
  if (active?.client) {
    try {
      await active.client.close();
    } catch {
      // ignore close errors
    }
    clientRegistry.delete(req.params.id);
  }
  res.json({ ok: true });
});

app.get("/api/databases", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const admin = client.db("admin");
    const response = await admin.admin().listDatabases();
    const dbs = response.databases.map((db) => ({
      name: db.name,
      sizeOnDisk: db.sizeOnDisk || 0,
      collections: 0,
    }));

    const names = dbs.map((d) => d.name);
    const counts = await Promise.all(
      names.map(async (name) => {
        try {
          const cols = await client.db(name).listCollections({}, { nameOnly: true }).toArray();
          return cols.length;
        } catch {
          return 0;
        }
      })
    );

    const mapped = dbs.map((db, idx) => ({ ...db, collections: counts[idx] }));
    res.json(mapped);
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/collections", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const database = req.params.database;
    const { client } = await getConnectedClientByConnectionId(connectionId);

    const db = client.db(database);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const limitedCollections = collections.slice(0, 250);

    const counts = await Promise.all(
      limitedCollections.map(async (col) => {
        const coll = db.collection(col.name);
        const count = await coll.estimatedDocumentCount({ maxTimeMS: 3000 }).catch(() => 0);
        return { name: col.name, count };
      })
    );

    res.json(counts.map((c) => ({ ...c, avgDocSize: 0, storageSize: 0 })));
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/stats", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const database = req.params.database;
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const stats = await client.db(database).stats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/databases/:database", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const database = req.params.database;
    const { client } = await getConnectedClientByConnectionId(connectionId);
    await client.db(database).dropDatabase();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/databases/:database/duplicate", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const sourceDb = req.params.database;
    const targetDb = String(req.body.targetDatabase || "").trim();
    if (!targetDb) return res.status(400).json({ error: "targetDatabase is required" });

    const { client } = await getConnectedClientByConnectionId(connectionId);
    const src = client.db(sourceDb);
    const dst = client.db(targetDb);
    const collections = await src.listCollections({}, { nameOnly: true }).toArray();

    for (const col of collections) {
      const srcColl = src.collection(col.name);
      const dstName = col.name;
      const existing = await dst.listCollections({ name: dstName }, { nameOnly: true }).toArray();
      if (!existing.length) {
        await dst.createCollection(dstName);
      }

      const docs = await srcColl.find({}, { limit: 100000 }).toArray();
      if (docs.length > 0) {
        await dst.collection(dstName).deleteMany({});
        await dst.collection(dstName).insertMany(docs, { ordered: false }).catch(() => undefined);
      }
    }

    res.json({ ok: true, collectionsCopied: collections.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/export", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const format = String(req.query.format || "json").toLowerCase();
    const sourceDb = req.params.database;
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(sourceDb);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    const exportData = {
      database: sourceDb,
      exportedAt: new Date().toISOString(),
      collections: {},
    };

    for (const col of collections) {
      const docs = await db.collection(col.name).find({}, { limit: 100000 }).toArray();
      exportData.collections[col.name] = serializeForJson(docs.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) })));
    }

    if (format === "csv" || format === "excel") {
      const rows = [];
      for (const [collectionName, docs] of Object.entries(exportData.collections)) {
        for (const doc of docs) {
          rows.push({ _collection: collectionName, ...doc });
        }
      }
      return res.json({ ok: true, format, data: rowsToCsv(rows) });
    }

    if (format === "bson") {
      return res.json({ ok: true, format: "bson", data: JSON.stringify(exportData) });
    }

    return res.json({ ok: true, format: "json", data: JSON.stringify(exportData, null, 2) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/databases/:database/import", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const targetDatabase = String(req.body.targetDatabase || req.params.database).trim();
    const format = String(req.body.format || "json").toLowerCase();
    const payload = String(req.body.payload || "");
    if (!payload.trim()) return res.status(400).json({ error: "payload is required" });
    const collectionsMap = parseDatabaseImportPayload(payload, format, req.body.defaultCollection || "imported_data");
    if (!collectionsMap || typeof collectionsMap !== "object") {
      return res.status(400).json({ error: "Invalid database import payload" });
    }
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(targetDatabase);

    let importedCollections = 0;
    let importedDocuments = 0;

    for (const [name, docsRaw] of Object.entries(collectionsMap)) {
      if (!Array.isArray(docsRaw)) continue;
      const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
      if (!existing.length) await db.createCollection(name);
      const docs = docsRaw.map((doc) => ({ ...doc, _id: toObjectIdMaybe(doc._id) }));
      if (docs.length) {
        await db.collection(name).insertMany(docs, { ordered: false }).catch(() => undefined);
      }
      importedCollections += 1;
      importedDocuments += docs.length;
    }

    res.json({ ok: true, targetDatabase, importedCollections, importedDocuments });
  } catch (error) {
    next(error);
  }
});

app.post("/api/databases/:database/collections", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const database = req.params.database;
    const collectionName = String(req.body.collectionName || "").trim();
    if (!collectionName) return res.status(400).json({ error: "collectionName is required" });

    const { client } = await getConnectedClientByConnectionId(connectionId);
    await client.db(database).createCollection(collectionName);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/databases/:database/collections/:collection", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    await client.db(req.params.database).collection(req.params.collection).drop().catch(() => undefined);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/collections/:collection/stats", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const stats = await client
      .db(req.params.database)
      .command({ collStats: req.params.collection, scale: 1 });
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

app.put("/api/databases/:database/collections/:collection/rename", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const newName = String(req.body.newName || "").trim();
    if (!newName) return res.status(400).json({ error: "newName is required" });
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const coll = client.db(req.params.database).collection(req.params.collection);
    await coll.rename(newName, { dropTarget: false });
    res.json({ ok: true, newName });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/databases/:database/collections/:collection/documents", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const result = await client.db(req.params.database).collection(req.params.collection).deleteMany({});
    res.json({ ok: true, deletedCount: result.deletedCount || 0 });
  } catch (error) {
    next(error);
  }
});

app.post("/api/databases/:database/collections/:collection/duplicate", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const targetCollection = String(req.body.targetCollection || "").trim();
    if (!targetCollection) return res.status(400).json({ error: "targetCollection is required" });

    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(req.params.database);
    const src = db.collection(req.params.collection);

    const existing = await db.listCollections({ name: targetCollection }, { nameOnly: true }).toArray();
    if (!existing.length) await db.createCollection(targetCollection);

    const docs = await src.find({}, { limit: 100000 }).toArray();
    if (docs.length) {
      await db.collection(targetCollection).deleteMany({});
      await db.collection(targetCollection).insertMany(docs, { ordered: false }).catch(() => undefined);
    }

    res.json({ ok: true, copiedDocuments: docs.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/databases/:database/collections/:collection/indexes", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const keys = parseLooseJSON(req.body.keys, {});
    const options = parseLooseJSON(req.body.options, {});
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const name = await client.db(req.params.database).collection(req.params.collection).createIndex(keys, options);
    res.json({ ok: true, name });
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/collections/:collection/export", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const format = String(req.query.format || "json").toLowerCase();
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const docs = await client.db(req.params.database).collection(req.params.collection).find({}, { limit: 100000 }).toArray();
    const normalized = serializeForJson(docs.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) })));

    if (format === "csv" || format === "excel") {
      return res.json({ ok: true, format, data: rowsToCsv(normalized) });
    }

    if (format === "bson") {
      return res.json({ ok: true, format, data: JSON.stringify(normalized) });
    }

    return res.json({ ok: true, format: "json", data: JSON.stringify(normalized, null, 2) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/databases/:database/collections/:collection/import", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const format = String(req.body.format || "json").toLowerCase();
    const payload = String(req.body.payload || "");
    const targetCollection = String(req.body.targetCollection || req.params.collection).trim();

    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(req.params.database);
    const existing = await db.listCollections({ name: targetCollection }, { nameOnly: true }).toArray();
    if (!existing.length) await db.createCollection(targetCollection);

    const docs = parseSingleCollectionImport(payload, format);

    if (docs.length) {
      await db.collection(targetCollection).insertMany(docs, { ordered: false }).catch(() => undefined);
    }

    res.json({ ok: true, importedCount: docs.length, targetCollection });
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/collections/:collection/mongodump", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const includeIndexes = String(req.query.includeIndexes || "true") !== "false";
    const includeMetadata = String(req.query.includeMetadata || "true") !== "false";
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(req.params.database);
    const coll = db.collection(req.params.collection);

    const docs = await coll.find({}, { limit: 100000 }).toArray();
    const out = {
      type: "mongodump-collection",
      database: req.params.database,
      collection: req.params.collection,
      dumpedAt: new Date().toISOString(),
      metadata: includeMetadata ? await db.command({ collStats: req.params.collection, scale: 1 }).catch(() => null) : undefined,
      indexes: includeIndexes ? await coll.indexes().catch(() => []) : [],
      documents: serializeForJson(docs.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
    };

    res.json({ ok: true, data: JSON.stringify(out, null, 2) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/mongodump", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const includeIndexes = String(req.query.includeIndexes || "true") !== "false";
    const includeMetadata = String(req.query.includeMetadata || "true") !== "false";
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(req.params.database);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    const out = {
      type: "mongodump-database",
      database: req.params.database,
      dumpedAt: new Date().toISOString(),
      collections: {},
    };

    for (const item of collections) {
      const coll = db.collection(item.name);
      const docs = await coll.find({}, { limit: 100000 }).toArray();
      out.collections[item.name] = {
        metadata: includeMetadata ? await db.command({ collStats: item.name, scale: 1 }).catch(() => null) : undefined,
        indexes: includeIndexes ? await coll.indexes().catch(() => []) : [],
        documents: serializeForJson(docs.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
      };
    }

    res.json({ ok: true, data: JSON.stringify(out, null, 2) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/databases/:database/security/overview", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const database = String(req.params.database || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(database);
    const adminDb = client.db("admin");
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const usersInfo = await db.command({ usersInfo: 1, showPrivileges: true }).catch(() => ({ users: [] }));
    const rolesInfo = await db.command({ rolesInfo: 1, showBuiltinRoles: true }).catch(() => ({ roles: [] }));

    let users = Array.isArray(usersInfo.users) ? usersInfo.users : [];
    let roles = Array.isArray(rolesInfo.roles) ? rolesInfo.roles : [];

    if (!users.length) {
      const rawUsers = await adminDb
        .collection("system.users")
        .find({ db: { $in: [database, "admin"] } }, { projection: { user: 1, db: 1, roles: 1 } })
        .toArray()
        .catch(() => []);

      users = rawUsers.map((user) => ({
        user: user.user,
        db: user.db,
        roles: user.roles || [],
        inheritedRoles: [],
      }));
    }

    if (!roles.length) {
      const rawRoles = await adminDb
        .collection("system.roles")
        .find({ db: { $in: [database, "admin"] } }, { projection: { role: 1, db: 1, isBuiltin: 1 } })
        .toArray()
        .catch(() => []);

      roles = rawRoles.map((role) => ({
        role: role.role,
        db: role.db,
        isBuiltin: Boolean(role.isBuiltin),
      }));
    }

    res.json({
      ok: true,
      database,
      collections: collections.map((item) => item.name),
      users: users.map((user) => ({
        user: user.user,
        db: user.db,
        roles: user.roles || [],
        inheritedRoles: user.inheritedRoles || [],
      })),
      roles: roles.map((role) => ({
        role: role.role,
        db: role.db,
        isBuiltin: role.isBuiltin,
      })),
      presets: {
        global: [
          { value: "root", db: "admin", label: "Root (Full admin)" },
          { value: "userAdminAnyDatabase", db: "admin", label: "User Admin Any DB" },
          { value: "readWriteAnyDatabase", db: "admin", label: "Read/Write Any DB" },
          { value: "readAnyDatabase", db: "admin", label: "Read Any DB" },
        ],
        database: [
          { value: "dbAdmin", db: database, label: "DB Admin" },
          { value: "userAdmin", db: database, label: "User Admin" },
          { value: "readWrite", db: database, label: "Read/Write (entire DB)" },
          { value: "read", db: database, label: "Read only (entire DB)" },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/databases/:database/security/users", async (req, res, next) => {
  try {
    const connectionId = String(req.body.connectionId || "");
    const database = String(req.params.database || "");
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const userType = String(req.body.userType || "custom");
    const grants = Array.isArray(req.body.grants) ? req.body.grants : [];
    const presetRoles = Array.isArray(req.body.presetRoles) ? req.body.presetRoles : [];
    if (!username) return res.status(400).json({ error: "username is required" });

    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(database);
    const usersInfo = await db.command({ usersInfo: username }).catch(() => ({ users: [] }));
    const userExists = Array.isArray(usersInfo.users) && usersInfo.users.length > 0;

    const roles = [];

    if (userType === "masterAdmin") {
      roles.push({ role: "root", db: "admin" });
    } else {
      presetRoles.forEach((item) => {
        if (item?.role && item?.db) roles.push({ role: String(item.role), db: String(item.db) });
      });

      for (const grant of grants) {
        const collection = String(grant?.collection || "").trim();
        const access = String(grant?.access || "read");
        if (!collection) continue;

        if (collection === "*") {
          roles.push({ role: access === "readWrite" ? "readWrite" : "read", db: database });
          continue;
        }

        const roleName = `webgui_${sanitizeRoleToken(database)}_${sanitizeRoleToken(collection)}_${sanitizeRoleToken(access)}`;
        await upsertCollectionScopedRole(db, roleName, collection, access === "readWrite" ? "readWrite" : "read");
        roles.push({ role: roleName, db: database });
      }
    }

    const dedupedRoles = Array.from(new Map(roles.map((r) => [`${r.db}.${r.role}`, r])).values());

    if (!userExists) {
      if (!password) return res.status(400).json({ error: "password is required for new users" });
      await db.command({
        createUser: username,
        pwd: password,
        roles: dedupedRoles,
      });
    } else {
      const updatePayload = {
        updateUser: username,
        roles: dedupedRoles,
      };
      if (password) updatePayload.pwd = password;
      await db.command(updatePayload);
    }

    res.json({ ok: true, username, database, roles: dedupedRoles, userType });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/databases/:database/security/users/:username", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const database = String(req.params.database || "");
    const username = String(req.params.username || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const db = client.db(database);
    await db.command({ dropUser: username });
    res.json({ ok: true, username, database });
  } catch (error) {
    next(error);
  }
});

app.post("/api/data-transfer", async (req, res, next) => {
  try {
    const sourceConnectionId = String(req.body.sourceConnectionId || "");
    const targetConnectionId = String(req.body.targetConnectionId || "");
    const sourceDatabase = String(req.body.sourceDatabase || "");
    const targetDatabase = String(req.body.targetDatabase || sourceDatabase);
    const sourceCollection = req.body.sourceCollection ? String(req.body.sourceCollection) : "";
    const targetCollection = req.body.targetCollection ? String(req.body.targetCollection) : "";
    const mode = String(req.body.mode || "append");
    const batchSizeRaw = Number(req.body.batchSize || 2000);
    const batchSize = Number.isFinite(batchSizeRaw) ? Math.max(100, Math.min(batchSizeRaw, 20000)) : 2000;

    if (!sourceConnectionId || !targetConnectionId || !sourceDatabase || !targetDatabase) {
      return res.status(400).json({ error: "sourceConnectionId, targetConnectionId, sourceDatabase and targetDatabase are required" });
    }

    const [{ client: sourceClient }, { client: targetClient }] = await Promise.all([
      getConnectedClientByConnectionId(sourceConnectionId),
      getConnectedClientByConnectionId(targetConnectionId),
    ]);

    const sourceDb = sourceClient.db(sourceDatabase);
    const targetDb = targetClient.db(targetDatabase);

    const insertChunk = async (targetColl, docs) => {
      if (!docs.length) return 0;
      try {
        const result = await targetColl.insertMany(docs, { ordered: false });
        return Number(result?.insertedCount || docs.length);
      } catch (error) {
        const inserted =
          Number(error?.result?.result?.nInserted) ||
          Number(error?.result?.nInserted) ||
          0;
        return inserted;
      }
    };

    const transferCollection = async (fromName, toName) => {
      if (
        mode === "replace" &&
        sourceConnectionId === targetConnectionId &&
        sourceDatabase === targetDatabase &&
        fromName === toName
      ) {
        throw new Error("Cannot use replace mode when source and target are the same collection");
      }

      const from = sourceDb.collection(fromName);
      const to = targetDb.collection(toName);
      const exists = await targetDb.listCollections({ name: toName }, { nameOnly: true }).toArray();
      if (!exists.length) await targetDb.createCollection(toName);

      if (mode === "replace") {
        await to.deleteMany({});
      }

      const cursor = from.find({}, { noCursorTimeout: true, batchSize });
      let chunk = [];
      let insertedTotal = 0;

      try {
        for await (const doc of cursor) {
          chunk.push(doc);
          if (chunk.length >= batchSize) {
            insertedTotal += await insertChunk(to, chunk);
            chunk = [];
          }
        }
      } finally {
        await cursor.close().catch(() => undefined);
      }

      if (chunk.length) {
        insertedTotal += await insertChunk(to, chunk);
      }

      return insertedTotal;
    };

    let collectionsProcessed = 0;
    let documentsTransferred = 0;

    if (sourceCollection) {
      const mappedTarget = targetCollection || sourceCollection;
      documentsTransferred += await transferCollection(sourceCollection, mappedTarget);
      collectionsProcessed = 1;
    } else {
      const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
      for (const coll of collections) {
        documentsTransferred += await transferCollection(coll.name, coll.name);
        collectionsProcessed += 1;
      }
    }

    res.json({
      ok: true,
      sourceConnectionId,
      targetConnectionId,
      sourceDatabase,
      targetDatabase,
      sourceCollection: sourceCollection || null,
      targetCollection: targetCollection || null,
      mode,
      collectionsProcessed,
      documentsTransferred,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/documents/find", async (req, res, next) => {
  try {
    const {
      connectionId,
      database,
      collection,
      filter = {},
      sort = {},
      projection = {},
      skip = 0,
      limit = 50,
    } = req.body || {};

    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(collection);

    const parsedFilter = parseLooseJSON(filter, {});
    const parsedSort = parseLooseJSON(sort, {});
    const parsedProjection = parseLooseJSON(projection, {});

    const start = Date.now();
    const safeLimit = clampLimit(limit, 50);
    const safeSkip = Math.max(Number(skip || 0), 0);

    const documents = await coll
      .find(parsedFilter, {
        projection: parsedProjection,
        sort: parsedSort,
        skip: safeSkip,
        limit: safeLimit,
        maxTimeMS: 12000,
      })
      .toArray();

    let total = 0;
    const hasFilter = Object.keys(parsedFilter || {}).length > 0;
    if (!hasFilter) {
      total = await coll.estimatedDocumentCount({ maxTimeMS: 3000 }).catch(() => safeSkip + documents.length);
    } else {
      total = await coll.countDocuments(parsedFilter, { maxTimeMS: 5000 }).catch(() => safeSkip + documents.length);
    }

    res.json({
      documents: serializeForJson(documents.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
      total,
      executionTime: Date.now() - start,
      skip: safeSkip,
      limit: safeLimit,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/documents/:database/:collection/:docId", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const { client } = await getConnectedClientByConnectionId(connectionId);
    const coll = client.db(req.params.database).collection(req.params.collection);
    const found = await coll.findOne({ _id: toObjectIdMaybe(req.params.docId) });
    res.json(found ? serializeForJson({ ...found, _id: encodeDocId(found._id) }) : null);
  } catch (error) {
    next(error);
  }
});

app.post("/api/documents", async (req, res, next) => {
  try {
    const { connectionId, database, collection, document } = req.body || {};
    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(collection);

    const payload = parseLooseJSON(document, {});
    if (payload._id) payload._id = toObjectIdMaybe(payload._id);

    const inserted = await coll.insertOne(payload);
    const found = await coll.findOne({ _id: inserted.insertedId });
    res.status(201).json(serializeForJson({ ...found, _id: encodeDocId(found._id) }));
  } catch (error) {
    next(error);
  }
});

app.put("/api/documents", async (req, res, next) => {
  try {
    const { connectionId, database, collection, docId, document } = req.body || {};
    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(collection);

    const payload = parseLooseJSON(document, {});
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "Document payload must be a JSON object" });
    }

    const _id = toObjectIdMaybe(docId);
    // PUT behaves as full-document replacement: omitted fields are removed.
    const replacement = { ...payload, _id };
    await coll.replaceOne({ _id }, replacement, { upsert: false });
    const found = await coll.findOne({ _id });

    if (!found) return res.status(404).json({ error: "Document not found" });
    res.json(serializeForJson({ ...found, _id: encodeDocId(found._id) }));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/documents", async (req, res, next) => {
  try {
    const { connectionId, database, collection, docId } = req.body || {};
    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(collection);

    const result = await coll.deleteOne({ _id: toObjectIdMaybe(docId) });
    res.json({ deletedCount: result.deletedCount || 0 });
  } catch (error) {
    next(error);
  }
});

app.get("/api/indexes", async (req, res, next) => {
  try {
    const connectionId = String(req.query.connectionId || "");
    const database = String(req.query.database || "");
    const collection = String(req.query.collection || "");

    const { client } = await getConnectedClientByConnectionId(connectionId);
    const indexes = await client.db(database).collection(collection).indexes();
    res.json(indexes);
  } catch (error) {
    next(error);
  }
});

app.post("/api/aggregate/execute", async (req, res, next) => {
  try {
    const { connectionId, database, collection, pipeline = [], stopAtStage = -1 } = req.body || {};
    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(collection);

    const parsedPipeline = reviveMongoLiterals(Array.isArray(pipeline) ? pipeline : parseLooseJSON(pipeline, []));
    const stagesCount = stopAtStage >= 0 ? Math.min(stopAtStage + 1, parsedPipeline.length) : parsedPipeline.length;

    let currentPipeline = [];
    const stageResults = [];
    let finalResults = [];

    for (let i = 0; i < stagesCount; i += 1) {
      currentPipeline.push(parsedPipeline[i]);
      const start = Date.now();

      const [preview, outputCount] = await Promise.all([
        coll.aggregate(currentPipeline, { allowDiskUse: true, maxTimeMS: 25000 }).limit(100).toArray(),
        coll
          .aggregate([...currentPipeline, { $count: "total" }], { allowDiskUse: true, maxTimeMS: 25000 })
          .toArray()
          .then((rows) => rows[0]?.total || 0),
      ]);

      finalResults = preview;
      stageResults.push({
        stageIndex: i,
        operator: Object.keys(parsedPipeline[i] || {})[0] || "unknown",
        inputCount: i === 0 ? null : stageResults[i - 1].outputCount,
        outputCount,
        elapsedMs: Date.now() - start,
        preview: serializeForJson(preview.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
        status: "success",
      });
    }

    const normalizedStageResults = stageResults.map((s, idx) => ({
      ...s,
      inputCount: s.inputCount == null ? s.outputCount : s.inputCount,
    }));

    res.json({
      results: serializeForJson(finalResults.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
      total: normalizedStageResults.at(-1)?.outputCount || 0,
      stageResults: normalizedStageResults,
      totalExecutionTime: normalizedStageResults.reduce((sum, item) => sum + item.elapsedMs, 0),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/aggregate/explain", async (req, res, next) => {
  try {
    const { connectionId, database, collection, pipeline = [] } = req.body || {};
    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(collection);
    const parsedPipeline = reviveMongoLiterals(Array.isArray(pipeline) ? pipeline : parseLooseJSON(pipeline, []));

    const explainDoc = await coll.aggregate(parsedPipeline, { allowDiskUse: true }).explain("executionStats");

    const stages = parsedPipeline.map((stage, idx) => ({
      stageIndex: idx,
      operator: Object.keys(stage)[0],
      estimatedCost: "unknown",
      indexUsed: null,
      scanType: "unknown",
    }));

    const flat = JSON.stringify(explainDoc);
    if (flat.includes("IXSCAN")) {
      if (stages[0]) stages[0].scanType = "IXSCAN";
    }
    if (flat.includes("COLLSCAN")) {
      stages.forEach((s) => {
        if (s.scanType === "unknown") s.scanType = "COLLSCAN";
      });
    }

    res.json({
      stages,
      totalEstimatedMs: explainDoc?.executionStats?.executionTimeMillis || 0,
      warnings: flat.includes("COLLSCAN") ? ["Collection scan detected. Consider adding/selecting indexes."] : [],
      raw: explainDoc,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/shell/execute", async (req, res, next) => {
  try {
    const { connectionId, database, command } = req.body || {};
    const parsed = parseShellCommand(command);
    if (!parsed) {
      return res.json({
        type: "error",
        output: "Command not recognized. Supported: db.<collection>.find(), .countDocuments(), .aggregate()",
        executionTime: 0,
      });
    }

    const start = Date.now();
    const { client } = await getConnectedClientByConnectionId(String(connectionId || ""));
    const coll = client.db(database).collection(parsed.collection);

    if (parsed.type === "find") {
      const docs = await coll
        .find(parsed.filter || {}, {
          projection: parsed.projection || {},
          limit: 50,
          maxTimeMS: 12000,
        })
        .toArray();
      return res.json({
        type: "documents",
        output: serializeForJson(docs.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
        executionTime: Date.now() - start,
      });
    }

    if (parsed.type === "count") {
      const total = await coll.countDocuments(parsed.filter || {}, { maxTimeMS: 12000 });
      return res.json({ type: "number", output: total, executionTime: Date.now() - start });
    }

    const rows = await coll
      .aggregate(parsed.pipeline || [], { allowDiskUse: true, maxTimeMS: 25000 })
      .limit(100)
      .toArray();
    return res.json({
      type: "documents",
      output: serializeForJson(rows.map((doc) => ({ ...doc, _id: encodeDocId(doc._id) }))),
      executionTime: Date.now() - start,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings/llm", (_req, res) => {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'llm'").get();
  const parsed = row ? parseLooseJSON(row.value, {}) : {};
  res.json({
    apiKey: parsed.apiKey || "",
    model: parsed.model || "gpt-4o-mini",
    baseUrl: parsed.baseUrl || "https://api.openai.com/v1",
  });
});

app.put("/api/settings/llm", (req, res) => {
  const payload = {
    apiKey: String(req.body?.apiKey || ""),
    model: String(req.body?.model || "gpt-4o-mini"),
    baseUrl: String(req.body?.baseUrl || "https://api.openai.com/v1"),
  };

  sqlite
    .prepare(`INSERT INTO settings (key, value, updatedAt)
              VALUES ('llm', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`)
    .run(JSON.stringify(payload), Date.now());

  res.json({ ok: true });
});

function extractJsonBlock(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
}

app.post("/api/llm/generate-query", async (req, res, next) => {
  try {
    const { instruction, database, collection } = req.body || {};
    if (!instruction || !String(instruction).trim()) {
      return res.status(400).json({ error: "instruction is required" });
    }

    const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'llm'").get();
    const settings = row ? parseLooseJSON(row.value, {}) : {};
    if (!settings.apiKey) {
      return res.status(400).json({ error: "LLM API key not configured" });
    }

    const baseUrl = String(settings.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = String(settings.model || "gpt-4o-mini");

    const preWrapperPrompt = [
      "Your goal is to generate a valid MongoDB shell query string.",
      "You must transform the user request into a single executable query.",
      "Prefer db.getCollection('<name>').find(...) for read operations.",
      "If the request asks for aggregation, return db.getCollection('<name>').aggregate([...]).",
      "Use the provided database/collection context when present.",
      "Return only one fenced JSON block and no prose.",
      "Output schema:",
      "```json",
      '{"query":"db.getCollection(\\"users\\").find({})"}',
      "```",
    ].join("\n");

    const userRequestPrompt = [
      `Database: ${database || "unknown"}`,
      `Collection: ${collection || "unknown"}`,
      `User asked: ${instruction}`,
    ].join("\n");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: "You are an expert MongoDB query generator. Return only valid, parseable output." },
          { role: "user", content: `${preWrapperPrompt}\n\n${userRequestPrompt}` },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(502).json({ error: `LLM request failed: ${body.slice(0, 300)}` });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || "";
    const jsonBlock = extractJsonBlock(content);

    let parsed;
    try {
      parsed = JSON.parse(jsonBlock);
    } catch {
      return res.status(502).json({ error: "Could not parse JSON block from LLM response", raw: content });
    }

    const query = String(parsed.query || "").trim();
    if (!query) {
      return res.status(502).json({ error: "LLM JSON did not include 'query'" });
    }

    res.json({ query, raw: content, model });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = Number(error?.statusCode || 500);
  res.status(statusCode).json({
    error: error?.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`WebMongoGui API running on http://localhost:${PORT}`);
});
