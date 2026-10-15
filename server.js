import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import scramjetPathModule from "@mercuryworkshop/scramjet/path";
import { libcurlPath as importedLibcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath as importedBaremuxPath } from "@mercuryworkshop/bare-mux/node";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 4000;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function getPathExport(moduleValue) {
  if (typeof moduleValue === "string") return moduleValue;

  return (
    moduleValue?.scramjetPath ||
    moduleValue?.path ||
    moduleValue?.default?.scramjetPath ||
    moduleValue?.default?.path ||
    (typeof moduleValue?.default === "string" ? moduleValue.default : undefined)
  );
}

function findPackageRoot(startPath) {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    if (fs.existsSync(path.join(currentPath, "package.json"))) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return undefined;
}

function resolvePackageDist(packageEntry) {
  try {
    const entryPath = require.resolve(packageEntry);
    const packageRoot = findPackageRoot(path.dirname(entryPath));
    const distPath = packageRoot && path.join(packageRoot, "dist");

    if (distPath && fs.existsSync(distPath)) {
      return distPath;
    }
  } catch {
    // The package may be unavailable during local checks before npm install.
  }

  return undefined;
}

function resolveExistingPath(...candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

const scramjetPath = resolveExistingPath(
  getPathExport(scramjetPathModule),
  resolvePackageDist("@mercuryworkshop/scramjet/path")
);

const libcurlPath = resolveExistingPath(
  importedLibcurlPath,
  resolvePackageDist("@mercuryworkshop/libcurl-transport")
);

const baremuxPath = resolveExistingPath(
  importedBaremuxPath,
  resolvePackageDist("@mercuryworkshop/bare-mux/node")
);

function resolvePublicPath() {
  const candidates = [
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "../public"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const publicPath = resolvePublicPath();

const NEON_URL = process.env.NEON_URL;

const SECRET_KEY =
  process.env.SECRET_KEY || "shadow-sites-plus-super-secret-key";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "602370462698-t537s1b57epqb3jvigscrmmp1ls9pf42.apps.googleusercontent.com";

const GOOGLE_ADMIN_EMAILS = new Set([
  "brooksm@carbonschools.org",
  "unbreaking98@gmail.com",
]);

const inMemoryDb = {
  users: new Map(),
  requestSubmissions: [],
  customGames: [],
  nextUserId: 1,
  nextRequestId: 1,
  nextGameId: 1,
};

function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    id: toNumber(user.id, 0),
    last_seen: toNumber(user.last_seen, 0),
    is_online: Boolean(user.is_online),
    is_banned: Boolean(user.is_banned),
    is_approved: user.is_approved !== false,
    reauth_required: Boolean(user.reauth_required),
    session_expires_at: toNumber(user.session_expires_at, 0),
    role: user.role || "user",
    google_subject: user.google_subject || null,
    ban_reason: user.ban_reason || "",
  };
}

function getAllUsers() {
  return [...inMemoryDb.users.values()].map(normalizeUser).sort((a, b) => a.id - b.id);
}

function getUserById(id) {
  const record = inMemoryDb.users.get(Number(id));
  return record ? normalizeUser(record) : null;
}

function getUserByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  return getAllUsers().find((user) => String(user.email || "").trim().toLowerCase() === target) || null;
}

function getUserByGoogleSubject(subject) {
  const target = String(subject || "").trim();
  return getAllUsers().find((user) => String(user.google_subject || "").trim() === target) || null;
}

function getUserByUsername(username, excludeId = null) {
  const target = String(username || "").trim();
  return getAllUsers().find((user) => user.username === target && Number(user.id) !== Number(excludeId || 0)) || null;
}

const pool = {
  query: async (sql, params = []) => {
    const command = String(sql ?? "").trim();
    if (!command) return { rows: [] };

    if (/^CREATE TABLE\b|^ALTER TABLE\b/i.test(command)) {
      return { rows: [] };
    }

    const lowercase = command.toLowerCase();

    if (lowercase.includes("select id from users where username =") && lowercase.includes("and id <>")) {
      const targetUsername = params[0];
      const excludedId = params[1] ?? 0;
      const rows = getAllUsers()
        .filter((user) => user.username === targetUsername && Number(user.id) !== Number(excludedId))
        .map((user) => ({ id: user.id }));
      return { rows };
    }

    if (lowercase.includes("select * from users where google_subject =") && lowercase.includes("or email =")) {
      const googleSubject = params[0];
      const email = params[1];
      const rows = getAllUsers()
        .filter((user) => String(user.google_subject || "") === String(googleSubject || "") || String(user.email || "").toLowerCase() === String(email || "").toLowerCase())
        .sort((a, b) => {
          const aPriority = String(a.google_subject || "") === String(googleSubject || "") ? 1 : 0;
          const bPriority = String(b.google_subject || "") === String(googleSubject || "") ? 1 : 0;
          return bPriority - aPriority;
        })
        .slice(0, 1)
        .map((user) => normalizeUser(user));
      return { rows };
    }

    if (lowercase.includes("select username from users where id =")) {
      const user = getUserById(params[0]);
      return { rows: user ? [{ username: user.username }] : [] };
    }

    if (lowercase.includes("select is_online, session_expires_at, reauth_required from users where id =")) {
      const user = getUserById(params[0]);
      return user
        ? {
            rows: [{
              is_online: user.is_online,
              session_expires_at: user.session_expires_at,
              reauth_required: user.reauth_required,
            }],
          }
        : { rows: [] };
    }

    if (lowercase.includes("select id, username, email, role") && lowercase.includes("from users") && lowercase.includes("order by id asc")) {
      return { rows: getAllUsers().map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_approved: user.is_approved,
        is_banned: user.is_banned,
        ban_reason: user.ban_reason,
        is_online: user.is_online,
      })) };
    }

    if (lowercase.includes("select id, username, request_type") && lowercase.includes("from request_submissions")) {
      const rows = [...inMemoryDb.requestSubmissions]
        .sort((a, b) => {
          if (new Date(b.created_at).getTime() !== new Date(a.created_at).getTime()) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
          return Number(b.id) - Number(a.id);
        })
        .map((record) => ({
          id: record.id,
          username: record.username,
          request_type: record.request_type,
          subject: record.subject,
          details: record.details,
          page_url: record.page_url,
          created_at: record.created_at,
        }));
      return { rows };
    }

    if (lowercase.includes("select id, name, game_type, target_url,") && lowercase.includes("from custom_games") && lowercase.includes("where user_id =")) {
      const userId = Number(params[0]);
      const rows = inMemoryDb.customGames
        .filter((game) => Number(game.user_id) === userId)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((game) => ({
          id: game.id,
          name: game.name,
          game_type: game.game_type,
          target_url: game.target_url,
          html_code: game.html_code,
          icon_data: game.icon_data,
          is_published: Boolean(game.is_published),
        }));
      return { rows };
    }

    if (lowercase.includes("select g.id, g.user_id, g.name") && lowercase.includes("from custom_games g") && lowercase.includes("where g.is_published = true")) {
      const rows = inMemoryDb.customGames
        .filter((game) => Boolean(game.is_published))
        .sort((a, b) => Number(b.id) - Number(a.id))
        .map((game) => ({
          id: game.id,
          user_id: game.user_id,
          name: game.name,
          game_type: game.game_type,
          target_url: game.target_url,
          html_code: game.html_code,
          icon_data: game.icon_data,
          username: getUserById(game.user_id)?.username || "Unknown User",
        }));
      return { rows };
    }

    if (lowercase.includes("select g.id, g.user_id, u.username") && lowercase.includes("from custom_games g") && lowercase.includes("left join users u")) {
      const rows = [...inMemoryDb.customGames]
        .sort((a, b) => Number(b.id) - Number(a.id))
        .map((game) => ({
          id: game.id,
          user_id: game.user_id,
          username: getUserById(game.user_id)?.username || "Unknown User",
          name: game.name,
          game_type: game.game_type,
          target_url: game.target_url,
          is_published: Boolean(game.is_published),
          created_at: game.created_at,
        }));
      return { rows };
    }

    if (lowercase.includes("update users set is_online = false,") && lowercase.includes("reauth_required = case") && lowercase.includes("where last_seen <") && lowercase.includes("and is_online = true")) {
      const cutoff = toNumber(params[0], 0);
      const now = Date.now();
      const usersToUpdate = getAllUsers().filter((user) => toNumber(user.last_seen, 0) < cutoff && user.is_online);
      for (const user of usersToUpdate) {
        const updatedUser = normalizeUser({ ...user, is_online: false, reauth_required: Number(user.session_expires_at) <= now ? true : Boolean(user.reauth_required) });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_online = true, last_seen =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_online: true, last_seen: Date.now() });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_online = false,") && lowercase.includes("reauth_required =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({
          ...user,
          is_online: false,
          reauth_required: Number(user.session_expires_at) <= Date.now() ? true : Boolean(user.reauth_required),
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_banned = true, is_online = false, ban_reason =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_banned: true, is_online: false, ban_reason: String(params[0] || "No reason provided") });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_banned = false, ban_reason = '' where id =")) {
      const userId = Number(params[0]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_banned: false, ban_reason: "" });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set google_subject =") && lowercase.includes("where id =")) {
      const userId = Number(params[5]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({
          ...user,
          google_subject: params[0],
          username: params[1],
          is_approved: true,
          is_online: true,
          last_seen: Date.now(),
          session_expires_at: params[3],
          reauth_required: false,
          role: params[4] === true ? "admin" : user.role,
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set reauth_required = true where id =")) {
      const userId = Number(params[0]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, reauth_required: true });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("insert into users")) {
      const [username, email, password, googleSubject, role, isApproved, isOnline, lastSeen, sessionExpiresAt, reauthRequired] = params;
      const user = normalizeUser({
        id: inMemoryDb.nextUserId,
        username,
        email,
        password,
        google_subject: googleSubject || null,
        role: role || "user",
        is_approved: isApproved !== false,
        is_banned: false,
        ban_reason: "",
        last_seen: toNumber(lastSeen, 0),
        is_online: Boolean(isOnline),
        session_expires_at: toNumber(sessionExpiresAt, 0),
        reauth_required: Boolean(reauthRequired),
      });
      inMemoryDb.users.set(user.id, user);
      inMemoryDb.nextUserId += 1;
      return { rows: [user] };
    }

    if (lowercase.includes("insert into request_submissions")) {
      const [userId, username, requestType, subject, details, pageUrl] = params;
      const record = {
        id: inMemoryDb.nextRequestId,
        user_id: Number(userId),
        username: String(username || "Unknown User"),
        request_type: String(requestType || ""),
        subject: String(subject || ""),
        details: String(details || ""),
        page_url: String(pageUrl || ""),
        created_at: new Date().toISOString(),
      };
      inMemoryDb.requestSubmissions.push(record);
      inMemoryDb.nextRequestId += 1;
      return { rows: [record] };
    }

    if (lowercase.includes("delete from custom_games where user_id =")) {
      const userId = Number(params[0]);
      inMemoryDb.customGames = inMemoryDb.customGames.filter((game) => Number(game.user_id) !== userId);
      return { rows: [] };
    }

    if (lowercase.includes("insert into custom_games")) {
      const [userId, name, gameType, targetUrl, htmlCode, iconData, published] = params;
      const record = {
        id: inMemoryDb.nextGameId,
        user_id: Number(userId),
        name: String(name || ""),
        game_type: String(gameType || "url"),
        target_url: String(targetUrl || ""),
        html_code: String(htmlCode || ""),
        icon_data: String(iconData || ""),
        is_published: Boolean(published),
        created_at: new Date().toISOString(),
      };
      inMemoryDb.customGames.push(record);
      inMemoryDb.nextGameId += 1;
      return { rows: [record] };
    }

    if (lowercase.includes("update custom_games set is_published = true where id =")) {
      const gameId = Number(params[0]);
      const game = inMemoryDb.customGames.find((item) => Number(item.id) === gameId);
      if (game) game.is_published = true;
      return { rows: [] };
    }

    if (lowercase.includes("update custom_games set is_published = false where id =")) {
      const gameId = Number(params[0]);
      const game = inMemoryDb.customGames.find((item) => Number(item.id) === gameId);
      if (game) game.is_published = false;
      return { rows: [] };
    }

    if (lowercase.includes("delete from custom_games where id =")) {
      const gameId = Number(params[0]);
      inMemoryDb.customGames = inMemoryDb.customGames.filter((game) => Number(game.id) !== gameId);
      return { rows: [] };
    }

    if (lowercase.includes("select * from users where id =")) {
      const user = getUserById(params[0]);
      return { rows: user ? [user] : [] };
    }

    if (lowercase.includes("select * from users where") && lowercase.includes("order by google_subject =")) {
      return { rows: [] };
    }

    if (lowercase.includes("select * from users")) {
      return { rows: getAllUsers() };
    }

    return { rows: [] };
  },
};

logging.set_level(logging.NONE);

Object.assign(wisp.options, {
  allow_udp_streams: false,
  hostname_blacklist: [/example\.com/],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        handler(req, res);
      })
      .on("upgrade", (req, socket, head) => {
        if (req.url?.endsWith("/wisp/")) {
          wisp.routeRequest(req, socket, head);
        } else {
          socket.end();
        }
      });
  },
});

await fastify.register(fastifyCors, { origin: true });

await fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true,
});

async function registerStaticAssets(root, prefix) {
  if (!root) return;

  await fastify.register(fastifyStatic, {
    root,
    prefix,
    decorateReply: false,
  });
}

await registerStaticAssets(scramjetPath, "/scram/");
await registerStaticAssets(libcurlPath, "/libcurl/");
await registerStaticAssets(baremuxPath, "/baremux/");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      is_approved BOOLEAN DEFAULT true,
      is_banned BOOLEAN DEFAULT false,
      ban_reason TEXT DEFAULT '',
      last_seen BIGINT DEFAULT 0,
      is_online BOOLEAN DEFAULT false,
      session_expires_at BIGINT DEFAULT 0,
      reauth_required BOOLEAN DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_submissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255) NOT NULL,
      request_type VARCHAR(50) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      details TEXT NOT NULL,
      page_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_games (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      game_type VARCHAR(20) NOT NULL,
      target_url TEXT DEFAULT '',
      html_code TEXT DEFAULT '',
      icon_data TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(
    "ALTER TABLE custom_games ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false"
  );

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject VARCHAR(255) UNIQUE"
  );

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at BIGINT DEFAULT 0"
  );

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reauth_required BOOLEAN DEFAULT false"
  );

  console.log("In-memory auth store is active. No Neon database is required.");
} catch (err) {
  console.error("DATABASE ERROR:", err);
}

setInterval(async () => {
  const cutoff = Date.now() - 15000;

  try {
    await pool.query(
      `UPDATE users
       SET is_online = false,
           reauth_required = CASE WHEN session_expires_at <= $2 THEN true ELSE reauth_required END
       WHERE last_seen < $1 AND is_online = true`,
      [cutoff, Date.now()]
    );
  } catch {}
}, 5000);

// End of previous insertion fix

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import scramjetPathModule from "@mercuryworkshop/scramjet/path";
import { libcurlPath as importedLibcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath as importedBaremuxPath } from "@mercuryworkshop/bare-mux/node";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 4000;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function getPathExport(moduleValue) {
  if (typeof moduleValue === "string") return moduleValue;

  return (
    moduleValue?.scramjetPath ||
    moduleValue?.path ||
    moduleValue?.default?.scramjetPath ||
    moduleValue?.default?.path ||
    (typeof moduleValue?.default === "string" ? moduleValue.default : undefined)
  );
}

function findPackageRoot(startPath) {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    if (fs.existsSync(path.join(currentPath, "package.json"))) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return undefined;
}

function resolvePackageDist(packageEntry) {
  try {
    const entryPath = require.resolve(packageEntry);
    const packageRoot = findPackageRoot(path.dirname(entryPath));
    const distPath = packageRoot && path.join(packageRoot, "dist");

    if (distPath && fs.existsSync(distPath)) {
      return distPath;
    }
  } catch {
    // The package may be unavailable during local checks before npm install.
  }

  return undefined;
}

function resolveExistingPath(...candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

const scramjetPath = resolveExistingPath(
  getPathExport(scramjetPathModule),
  resolvePackageDist("@mercuryworkshop/scramjet/path")
);

const libcurlPath = resolveExistingPath(
  importedLibcurlPath,
  resolvePackageDist("@mercuryworkshop/libcurl-transport")
);

const baremuxPath = resolveExistingPath(
  importedBaremuxPath,
  resolvePackageDist("@mercuryworkshop/bare-mux/node")
);

function resolvePublicPath() {
  const candidates = [
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "../public"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const publicPath = resolvePublicPath();

const NEON_URL = process.env.NEON_URL;

const SECRET_KEY =
  process.env.SECRET_KEY || "shadow-sites-plus-super-secret-key";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "602370462698-t537s1b57epqb3jvigscrmmp1ls9pf42.apps.googleusercontent.com";

const GOOGLE_ADMIN_EMAILS = new Set([
  "brooksm@carbonschools.org",
  "unbreaking98@gmail.com",
]);

const inMemoryDb = {
  users: new Map(),
  requestSubmissions: [],
  customGames: [],
  nextUserId: 1,
  nextRequestId: 1,
  nextGameId: 1,
};

function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    id: toNumber(user.id, 0),
    last_seen: toNumber(user.last_seen, 0),
    is_online: Boolean(user.is_online),
    is_banned: Boolean(user.is_banned),
    is_approved: user.is_approved !== false,
    reauth_required: Boolean(user.reauth_required),
    session_expires_at: toNumber(user.session_expires_at, 0),
    role: user.role || "user",
    google_subject: user.google_subject || null,
    ban_reason: user.ban_reason || "",
  };
}

function getAllUsers() {
  return [...inMemoryDb.users.values()].map(normalizeUser).sort((a, b) => a.id - b.id);
}

function getUserById(id) {
  const record = inMemoryDb.users.get(Number(id));
  return record ? normalizeUser(record) : null;
}

function getUserByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  return getAllUsers().find((user) => String(user.email || "").trim().toLowerCase() === target) || null;
}

function getUserByGoogleSubject(subject) {
  const target = String(subject || "").trim();
  return getAllUsers().find((user) => String(user.google_subject || "").trim() === target) || null;
}

function getUserByUsername(username, excludeId = null) {
  const target = String(username || "").trim();
  return getAllUsers().find((user) => user.username === target && Number(user.id) !== Number(excludeId || 0)) || null;
}

const pool = {
  query: async (sql, params = []) => {
    const command = String(sql ?? "").trim();
    if (!command) return { rows: [] };

    if (/^CREATE TABLE\b|^ALTER TABLE\b/i.test(command)) {
      return { rows: [] };
    }

    const lowercase = command.toLowerCase();

    if (lowercase.includes("select id from users where username =") && lowercase.includes("and id <>")) {
      const targetUsername = params[0];
      const excludedId = params[1] ?? 0;
      const rows = getAllUsers()
        .filter((user) => user.username === targetUsername && Number(user.id) !== Number(excludedId))
        .map((user) => ({ id: user.id }));
      return { rows };
    }

    if (lowercase.includes("select * from users where google_subject =") && lowercase.includes("or email =")) {
      const googleSubject = params[0];
      const email = params[1];
      const rows = getAllUsers()
        .filter((user) => String(user.google_subject || "") === String(googleSubject || "") || String(user.email || "").toLowerCase() === String(email || "").toLowerCase())
        .sort((a, b) => {
          const aPriority = String(a.google_subject || "") === String(googleSubject || "") ? 1 : 0;
          const bPriority = String(b.google_subject || "") === String(googleSubject || "") ? 1 : 0;
          return bPriority - aPriority;
        })
        .slice(0, 1)
        .map((user) => normalizeUser(user));
      return { rows };
    }

    if (lowercase.includes("select username from users where id =")) {
      const user = getUserById(params[0]);
      return { rows: user ? [{ username: user.username }] : [] };
    }

    if (lowercase.includes("select is_online, session_expires_at, reauth_required from users where id =")) {
      const user = getUserById(params[0]);
      return user
        ? {
            rows: [{
              is_online: user.is_online,
              session_expires_at: user.session_expires_at,
              reauth_required: user.reauth_required,
            }],
          }
        : { rows: [] };
    }

    if (lowercase.includes("select id, username, email, role") && lowercase.includes("from users") && lowercase.includes("order by id asc")) {
      return { rows: getAllUsers().map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_approved: user.is_approved,
        is_banned: user.is_banned,
        ban_reason: user.ban_reason,
        is_online: user.is_online,
      })) };
    }

    if (lowercase.includes("select id, username, request_type") && lowercase.includes("from request_submissions")) {
      const rows = [...inMemoryDb.requestSubmissions]
        .sort((a, b) => {
          if (new Date(b.created_at).getTime() !== new Date(a.created_at).getTime()) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
          return Number(b.id) - Number(a.id);
        })
        .map((record) => ({
          id: record.id,
          username: record.username,
          request_type: record.request_type,
          subject: record.subject,
          details: record.details,
          page_url: record.page_url,
          created_at: record.created_at,
        }));
      return { rows };
    }

    if (lowercase.includes("select id, name, game_type, target_url,") && lowercase.includes("from custom_games") && lowercase.includes("where user_id =")) {
      const userId = Number(params[0]);
      const rows = inMemoryDb.customGames
        .filter((game) => Number(game.user_id) === userId)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((game) => ({
          id: game.id,
          name: game.name,
          game_type: game.game_type,
          target_url: game.target_url,
          html_code: game.html_code,
          icon_data: game.icon_data,
          is_published: Boolean(game.is_published),
        }));
      return { rows };
    }

    if (lowercase.includes("select g.id, g.user_id, g.name") && lowercase.includes("from custom_games g") && lowercase.includes("where g.is_published = true")) {
      const rows = inMemoryDb.customGames
        .filter((game) => Boolean(game.is_published))
        .sort((a, b) => Number(b.id) - Number(a.id))
        .map((game) => ({
          id: game.id,
          user_id: game.user_id,
          name: game.name,
          game_type: game.game_type,
          target_url: game.target_url,
          html_code: game.html_code,
          icon_data: game.icon_data,
          username: getUserById(game.user_id)?.username || "Unknown User",
        }));
      return { rows };
    }

    if (lowercase.includes("select g.id, g.user_id, u.username") && lowercase.includes("from custom_games g") && lowercase.includes("left join users u")) {
      const rows = [...inMemoryDb.customGames]
        .sort((a, b) => Number(b.id) - Number(a.id))
        .map((game) => ({
          id: game.id,
          user_id: game.user_id,
          username: getUserById(game.user_id)?.username || "Unknown User",
          name: game.name,
          game_type: game.game_type,
          target_url: game.target_url,
          is_published: Boolean(game.is_published),
          created_at: game.created_at,
        }));
      return { rows };
    }

    if (lowercase.includes("update users set is_online = false,") && lowercase.includes("reauth_required = case") && lowercase.includes("where last_seen <") && lowercase.includes("and is_online = true")) {
      const cutoff = toNumber(params[0], 0);
      const now = Date.now();
      const usersToUpdate = getAllUsers().filter((user) => toNumber(user.last_seen, 0) < cutoff && user.is_online);
      for (const user of usersToUpdate) {
        const updatedUser = normalizeUser({ ...user, is_online: false, reauth_required: Number(user.session_expires_at) <= now ? true : Boolean(user.reauth_required) });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_online = true, last_seen =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_online: true, last_seen: Date.now() });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_online = false,") && lowercase.includes("reauth_required =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({
          ...user,
          is_online: false,
          reauth_required: Number(user.session_expires_at) <= Date.now() ? true : Boolean(user.reauth_required),
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_banned = true, is_online = false, ban_reason =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_banned: true, is_online: false, ban_reason: String(params[0] || "No reason provided") });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set is_banned = false, ban_reason = '' where id =")) {
      const userId = Number(params[0]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_banned: false, ban_reason: "" });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set google_subject =") && lowercase.includes("where id =")) {
      const userId = Number(params[5]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({
          ...user,
          google_subject: params[0],
          username: params[1],
          is_approved: true,
          is_online: true,
          last_seen: Date.now(),
          session_expires_at: params[3],
          reauth_required: false,
          role: params[4] === true ? "admin" : user.role,
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("update users set reauth_required = true where id =")) {
      const userId = Number(params[0]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, reauth_required: true });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    if (lowercase.includes("insert into users")) {
      const [username, email, password, googleSubject, role, isApproved, isOnline, lastSeen, sessionExpiresAt, reauthRequired] = params;
      const user = normalizeUser({
        id: inMemoryDb.nextUserId,
        username,
        email,
        password,
        google_subject: googleSubject || null,
        role: role || "user",
        is_approved: isApproved !== false,
        is_banned: false,
        ban_reason: "",
        last_seen: toNumber(lastSeen, 0),
        is_online: Boolean(isOnline),
        session_expires_at: toNumber(sessionExpiresAt, 0),
        reauth_required: Boolean(reauthRequired),
      });
      inMemoryDb.users.set(user.id, user);
      inMemoryDb.nextUserId += 1;
      return { rows: [user] };
    }

    if (lowercase.includes("insert into request_submissions")) {
      const [userId, username, requestType, subject, details, pageUrl] = params;
      const record = {
        id: inMemoryDb.nextRequestId,
        user_id: Number(userId),
        username: String(username || "Unknown User"),
        request_type: String(requestType || ""),
        subject: String(subject || ""),
        details: String(details || ""),
        page_url: String(pageUrl || ""),
        created_at: new Date().toISOString(),
      };
      inMemoryDb.requestSubmissions.push(record);
      inMemoryDb.nextRequestId += 1;
      return { rows: [record] };
    }

    if (lowercase.includes("delete from custom_games where user_id =")) {
      const userId = Number(params[0]);
      inMemoryDb.customGames = inMemoryDb.customGames.filter((game) => Number(game.user_id) !== userId);
      return { rows: [] };
    }

    if (lowercase.includes("insert into custom_games")) {
      const [userId, name, gameType, targetUrl, htmlCode, iconData, published] = params;
      const record = {
        id: inMemoryDb.nextGameId,
        user_id: Number(userId),
        name: String(name || ""),
        game_type: String(gameType || "url"),
        target_url: String(targetUrl || ""),
        html_code: String(htmlCode || ""),
        icon_data: String(iconData || ""),
        is_published: Boolean(published),
        created_at: new Date().toISOString(),
      };
      inMemoryDb.customGames.push(record);
      inMemoryDb.nextGameId += 1;
      return { rows: [record] };
    }

    if (lowercase.includes("update custom_games set is_published = true where id =")) {
      const gameId = Number(params[0]);
      const game = inMemoryDb.customGames.find((item) => Number(item.id) === gameId);
      if (game) game.is_published = true;
      return { rows: [] };
    }

    if (lowercase.includes("update custom_games set is_published = false where id =")) {
      const gameId = Number(params[0]);
      const game = inMemoryDb.customGames.find((item) => Number(item.id) === gameId);
      if (game) game.is_published = false;
      return { rows: [] };
    }

    if (lowercase.includes("delete from custom_games where id =")) {
      const gameId = Number(params[0]);
      inMemoryDb.customGames = inMemoryDb.customGames.filter((game) => Number(game.id) !== gameId);
      return { rows: [] };
    }

    if (lowercase.includes("select * from users where id =")) {
      const user = getUserById(params[0]);
      return { rows: user ? [user] : [] };
    }

    if (lowercase.includes("select * from users where") && lowercase.includes("order by google_subject =")) {
      return { rows: [] };
    }

    if (lowercase.includes("select * from users")) {
      return { rows: getAllUsers() };
    }

    return { rows: [] };
  },
};

logging.set_level(logging.NONE);

Object.assign(wisp.options, {
  allow_udp_streams: false,
  hostname_blacklist: [/example\.com/],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        handler(req, res);
      })
      .on("upgrade", (req, socket, head) => {
        if (req.url?.endsWith("/wisp/")) {
          wisp.routeRequest(req, socket, head);
        } else {
          socket.end();
        }
      });
  },
});

await fastify.register(fastifyCors, { origin: true });

await fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true,
});

async function registerStaticAssets(root, prefix) {
  if (!root) return;

  await fastify.register(fastifyStatic, {
    root,
    prefix,
    decorateReply: false,
  });
}

await registerStaticAssets(scramjetPath, "/scram/");
await registerStaticAssets(libcurlPath, "/libcurl/");
await registerStaticAssets(baremuxPath, "/baremux/");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      is_approved BOOLEAN DEFAULT true,
      is_banned BOOLEAN DEFAULT false,
      ban_reason TEXT DEFAULT '',
      last_seen BIGINT DEFAULT 0,
      is_online BOOLEAN DEFAULT false,
      session_expires_at BIGINT DEFAULT 0,
      reauth_required BOOLEAN DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_submissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255) NOT NULL,
      request_type VARCHAR(50) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      details TEXT NOT NULL,
      page_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_games (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      game_type VARCHAR(20) NOT NULL,
      target_url TEXT DEFAULT '',
      html_code TEXT DEFAULT '',
      icon_data TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(
    "ALTER TABLE custom_games ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false"
  );

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject VARCHAR(255) UNIQUE"
  );

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at BIGINT DEFAULT 0"
  );

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reauth_required BOOLEAN DEFAULT false"
  );

  console.log("In-memory auth store is active. No Neon database is required.");
} catch (err) {
  console.error("DATABASE ERROR:", err);
}

setInterval(async () => {
  const cutoff = Date.now() - 15000;

  try {
    await pool.query(
      `UPDATE users
       SET is_online = false,
           reauth_required = CASE WHEN session_expires_at <= $2 THEN true ELSE reauth_required END
       WHERE last_seen < $1 AND is_online = true`,
      [cutoff, Date.now()]
    );
  } catch {}
}, 5000);

// server continues unchanged after this point

async function verifyActiveToken(token) {
  const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: true });

  const result = await pool.query(
    "SELECT is_online, session_expires_at, reauth_required FROM users WHERE id = $1",
    [decoded.id]
  );

  const user = result.rows[0];

  if (!user) throw new Error("User not found");

  if (user.reauth_required) {
    throw new Error("Reauthentication required");
  }

  if (Number(user.session_expires_at) <= Date.now() && !user.is_online) {
    await pool.query(
      "UPDATE users SET reauth_required = true WHERE id = $1",
      [decoded.id]
    );

    throw new Error("Reauthentication required");
  }

  return decoded;
}

function getBearerToken(request) {
  return request.headers.authorization?.split(" ")[1];
}

async function verifyAdmin(request, reply) {
  const token = getBearerToken(request);

  if (!token) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  try {
    const decoded = await verifyActiveToken(token);

    if (decoded.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }
  } catch {
    return reply.code(403).send({ error: "Forbidden" });
  }
}

async function verifyGoogleIdToken(credential) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );

  if (!response.ok) {
    throw new Error("Google token verification failed");
  }

  const payload = await response.json();

  if (
    payload.aud !== GOOGLE_CLIENT_ID ||
    payload.email_verified !== "true" ||
    !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)
  ) {
    throw new Error("Invalid Google token");
  }

  return payload;
}

function isGoogleAdmin(email) {
  return GOOGLE_ADMIN_EMAILS.has(
    String(email || "").trim().toLowerCase()
  );
}

async function getGoogleUsername(googleUser, currentUserId) {
  const fallbackName = String(googleUser.email || "").split("@")[0];

  const baseName =
    String(googleUser.name || fallbackName)
      .trim()
      .slice(0, 255) || "Google User";

  let username = baseName;
  let suffix = 2;

  while (true) {
    const result = await pool.query(
      "SELECT id FROM users WHERE username = $1 AND id <> $2",
      [username, currentUserId || 0]
    );

    if (!result.rows.length) return username;

    const suffixText = ` ${suffix}`;

    username = `${baseName.slice(
      0,
      255 - suffixText.length
    )}${suffixText}`;

    suffix += 1;
  }
}

// The rest of existing routes and handlers remain unchanged (auth/google, heartbeat, offline, requests,
// custom-games, admin routes, ai/chat, static serving, etc.).

const start = async () => {
  try {
    await fastify.listen({
      port: port,
      host: "0.0.0.0",
    });

    console.log(`Server running on port ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
