(import and full file contents)
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
  const candidates = [path.resolve(__dirname, "public"), path.resolve(__dirname, "../public")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const publicPath = resolvePublicPath();

const NEON_URL = process.env.NEON_URL;

const SECRET_KEY = process.env.SECRET_KEY || "shadow-sites-plus-super-secret-key";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "602370462698-t537s1b57epqb3jvigscrmmp1ls9pf42.apps.googleusercontent.com";

const GOOGLE_ADMIN_EMAILS = new Set(["brooksm@carbonschools.org", "unbreaking98@gmail.com"]);

/*
  In-memory DB
  - Keeps minimal data: users, request_submissions, custom_games, admin_messages
  - Non-persistent across restarts (consider adding JSON persistence or sqlite if you want persistence)
*/
const inMemoryDb = {
  users: new Map(),
  requestSubmissions: [],
  customGames: [],
  adminMessages: [],
  nextUserId: 1,
  nextRequestId: 1,
  nextGameId: 1,
  nextAdminMessageId: 1
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

/*
  pool.query shim
  - Behaves like the original code expected: returns { rows: [...] }
  - Supports the queries used by the app routes.
*/
const pool = {
  query: async (sql, params = []) => {
    const command = String(sql ?? "").trim();
    if (!command) return { rows: [] };

    // No-op for DDL/ALTER statements
    if (/^CREATE TABLE\b|^ALTER TABLE\b/i.test(command)) {
      return { rows: [] };
    }

    const lowercase = command.toLowerCase();

    // username uniqueness checks for Google username generation
    if (lowercase.includes("select id from users where username =") && lowercase.includes("and id <>")) {
      const targetUsername = params[0];
      const excludedId = params[1] ?? 0;
      const rows = getAllUsers()
        .filter((user) => user.username === targetUsername && Number(user.id) !== Number(excludedId))
        .map((user) => ({ id: user.id }));
      return { rows };
    }

    // lookup by google_subject or email
    if (lowercase.includes("select * from users where google_subject =") && lowercase.includes("or email =")) {
      const googleSubject = params[0];
      const email = params[1];
      const rows = getAllUsers()
        .filter(
          (user) =>
            String(user.google_subject || "") === String(googleSubject || "") ||
            String(user.email || "").toLowerCase() === String(email || "").toLowerCase()
        )
        .sort((a, b) => {
          const aPriority = String(a.google_subject || "") === String(googleSubject || "") ? 1 : 0;
          const bPriority = String(b.google_subject || "") === String(googleSubject || "") ? 1 : 0;
          return bPriority - aPriority;
        })
        .slice(0, 1)
        .map((user) => normalizeUser(user));
      return { rows };
    }

    // username lookup by id
    if (lowercase.includes("select username from users where id =")) {
      const user = getUserById(params[0]);
      return { rows: user ? [{ username: user.username }] : [] };
    }

    // active session checks
    if (lowercase.includes("select is_online, session_expires_at, reauth_required from users where id =")) {
      const user = getUserById(params[0]);
      return user
        ? {
            rows: [
              {
                is_online: user.is_online,
                session_expires_at: user.session_expires_at,
                reauth_required: user.reauth_required,
              },
            ],
          }
        : { rows: [] };
    }

    // admin users list
    if (lowercase.includes("select id, username, email, role") && lowercase.includes("from users") && lowercase.includes("order by id asc")) {
      return {
        rows: getAllUsers().map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          is_approved: user.is_approved,
          is_banned: user.is_banned,
          ban_reason: user.ban_reason,
          is_online: user.is_online,
        })),
      };
    }

    // requests listing
    if (lowercase.includes("select id, username, request_type") && lowercase.includes("from request_submissions")) {
      const rows = [...inMemoryDb.requestSubmissions]
        .sort((a, b) => {
          const ta = new Date(a.created_at).getTime();
          const tb = new Date(b.created_at).getTime();
          if (tb !== ta) return tb - ta;
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

    // custom games for a user
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

    // public games
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

    // admin custom games listing
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

    // admin_messages: select unread for user
    if (lowercase.includes("select id, subject, message, created_at") && lowercase.includes("from admin_messages") && lowercase.includes("where user_id =") && lowercase.includes("is_read = false")) {
      const userId = Number(params[0]);
      const rows = inMemoryDb.adminMessages
        .filter((m) => Number(m.user_id) === userId && !m.is_read)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((m) => ({
          id: m.id,
          subject: m.subject,
          message: m.message,
          created_at: m.created_at,
        }));
      return { rows };
    }

    // mark admin messages read by ids (UPDATE admin_messages SET is_read = true WHERE id = ANY($1::int[]))
    if (lowercase.includes("update admin_messages set is_read = true") && lowercase.includes("where id = any")) {
      const ids = Array.isArray(params[0]) ? params[0].map((v) => Number(v)) : [];
      for (const m of inMemoryDb.adminMessages) {
        if (ids.includes(m.id)) m.is_read = true;
      }
      return { rows: [] };
    }

    // insert admin message
    if (lowercase.includes("insert into admin_messages")) {
      const [userId, subject, message] = params;
      const record = {
        id: inMemoryDb.nextAdminMessageId++,
        user_id: Number(userId),
        subject: String(subject || ""),
        message: String(message || ""),
        created_at: new Date().toISOString(),
        is_read: false
      };
      inMemoryDb.adminMessages.push(record);
      return { rows: [record] };
    }

    // periodic offline update (no reauth/reset)
    if (
      lowercase.includes("update users set is_online = false,") &&
      lowercase.includes("where last_seen <") &&
      lowercase.includes("and is_online = true")
    ) {
      const cutoff = toNumber(params[0], 0);
      const usersToUpdate = getAllUsers().filter((user) => toNumber(user.last_seen, 0) < cutoff && user.is_online);
      for (const user of usersToUpdate) {
        const updatedUser = normalizeUser({
          ...user,
          is_online: false
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    // heartbeat updates
    if (lowercase.includes("update users set is_online = true, last_seen =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_online: true, last_seen: Date.now() });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    // offline endpoint update
    if (lowercase.includes("update users set is_online = false,") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({
          ...user,
          is_online: false
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    // ban
    if (lowercase.includes("update users set is_banned = true, is_online = false, ban_reason =") && lowercase.includes("where id =")) {
      const userId = Number(params[1]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({
          ...user,
          is_banned: true,
          is_online: false,
          ban_reason: String(params[0] || "No reason provided"),
        });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    // unban
    if (lowercase.includes("update users set is_banned = false, ban_reason = '' where id =")) {
      const userId = Number(params[0]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, is_banned: false, ban_reason: "" });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    // update google_subject / user update on google sign-in
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

    // set reauth_required
    if (lowercase.includes("update users set reauth_required = true where id =")) {
      const userId = Number(params[0]);
      const user = getUserById(userId);
      if (user) {
        const updatedUser = normalizeUser({ ...user, reauth_required: true });
        inMemoryDb.users.set(updatedUser.id, updatedUser);
      }
      return { rows: [] };
    }

    // insert user (on google sign-in when new)
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

    // insert request submission
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

    // delete custom games by user
    if (lowercase.includes("delete from custom_games where user_id =")) {
      const userId = Number(params[0]);
      inMemoryDb.customGames = inMemoryDb.customGames.filter((game) => Number(game.user_id) !== userId);
      return { rows: [] };
    }

    // insert custom game
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

    // publish/unpublish/delete custom games
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

    // select user by id
    if (lowercase.includes("select * from users where id =")) {
      const user = getUserById(params[0]);
      return { rows: user ? [user] : [] };
    }

    // fallback select all users
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
  // These are no-ops with the pool shim, but keep them for compatibility.
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

  // admin messages table (for admin -> client secret messages)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      subject VARCHAR(255) DEFAULT '',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_read BOOLEAN DEFAULT false
    );
  `);

  await pool.query("ALTER TABLE custom_games ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject VARCHAR(255) UNIQUE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at BIGINT DEFAULT 0");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reauth_required BOOLEAN DEFAULT false");

  console.log("In-memory auth store is active. No Neon database is required.");
} catch (err) {
  console.error("DATABASE ERROR:", err);
}

// mark offline when last_seen older than cutoff (graceful)
setInterval(async () => {
  const cutoff = Date.now() - 60000;

  try {
    await pool.query(
      `UPDATE users
       SET is_online = false
       WHERE last_seen < $1 AND is_online = true`,
      [cutoff]
    );
  } catch {}
}, 5000);

function getBearerToken(request) {
  return request.headers.authorization?.split(" ")[1];
}

function verifyToken(token) {
  return jwt.verify(token, SECRET_KEY, { ignoreExpiration: true });
}

// verifyActiveToken: only checks token validity and that the user exists and is not banned.
// It does NOT enforce session expiration / reauth behaviour.
async function verifyActiveToken(token) {
  const decoded = verifyToken(token);

  const result = await pool.query("SELECT is_banned FROM users WHERE id = $1", [decoded.id]);

  const user = result.rows[0];

  if (!user) throw new Error("User not found");

  if (user.is_banned) {
    throw new Error("User banned");
  }

  return decoded;
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
  return GOOGLE_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

async function getGoogleUsername(googleUser, currentUserId) {
  const fallbackName = String(googleUser.email || "").split("@")[0];

  const baseName = String(googleUser.name || fallbackName).trim().slice(0, 255) || "Google User";

  let username = baseName;
  let suffix = 2;

  while (true) {
    const result = await pool.query("SELECT id FROM users WHERE username = $1 AND id <> $2", [username, currentUserId || 0]);

    if (!result.rows.length) return username;

    const suffixText = ` ${suffix}`;

    username = `${baseName.slice(0, 255 - suffixText.length)}${suffixText}`;

    suffix += 1;
  }
}

fastify.post("/auth/google", async (request, reply) => {
  const { credential } = request.body ?? {};

  if (!credential) {
    return reply.code(400).send({
      error: "Google sign-in is required.",
    });
  }

  try {
    const googleUser = await verifyGoogleIdToken(credential);

    const existing = await pool.query(
      "SELECT * FROM users WHERE google_subject = $1 OR email = $2 ORDER BY google_subject = $1 DESC LIMIT 1",
      [googleUser.sub, googleUser.email]
    );

    let user = existing.rows[0];

    const username = await getGoogleUsername(googleUser, user?.id);

    const admin = isGoogleAdmin(googleUser.email);

    if (user && user.is_banned) {
      const banReason = (user.ban_reason || "").toString().trim() || "No reason provided";

      return reply.code(403).send({
        error: `You are banned. Reason: ${banReason}`,
        banned: true,
        banReason,
      });
    }

    const sessionExpiresAt = Date.now() + SESSION_DURATION_MS;

    if (user) {
      await pool.query(
        `UPDATE users
         SET google_subject = $1,
             username = $2,
             is_approved = true,
             is_online = true,
             last_seen = $3,
             session_expires_at = $4,
             reauth_required = false,
             role = CASE WHEN $5 THEN 'admin' ELSE role END
         WHERE id = $6`,
        [googleUser.sub, username, Date.now(), sessionExpiresAt, admin, user.id]
      );

      user.username = username;

      if (admin) {
        user.role = "admin";
      }
    } else {
      const placeholderPassword = await bcrypt.hash(crypto.randomUUID(), 10);

      const created = await pool.query(
        `INSERT INTO users
         (username, email, password, google_subject, role,
          is_approved, is_online, last_seen,
          session_expires_at, reauth_required)
         VALUES
         ($1, $2, $3, $4, $5, true, true, $6, $7, false)
         RETURNING *`,
        [username, googleUser.email, placeholderPassword, googleUser.sub, admin ? "admin" : "user", Date.now(), sessionExpiresAt]
      );

      user = created.rows[0];
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      SECRET_KEY
    );

    return reply.send({
      token,
      role: user.role,
      username: user.username,
    });
  } catch (err) {
    console.error("GOOGLE LOGIN ERROR:", err);

    if (err.code === "23505") {
      return reply.code(400).send({
        error: "That username is already in use.",
      });
    }

    return reply.code(401).send({
      error: "Google sign-in could not be verified.",
      details: err?.message || "Unknown Google authentication error",
    });
  }
});

// heartbeat: returns either { status: "ok", messages: [...] } or { status: "banned", banReason: "..." }
// It intentionally decodes the token without enforcing "active session expiry" so we can detect bans and kick immediately.
fastify.post("/heartbeat", async (request, reply) => {
  const token = getBearerToken(request);

  if (!token) {
    return reply.code(401).send({ error: "No token" });
  }

  try {
    const decoded = verifyToken(token);

    const userResult = await pool.query("SELECT id, is_banned, ban_reason FROM users WHERE id = $1", [decoded.id]);
    const user = userResult.rows[0];

    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    if (user.is_banned) {
      // Ensure they are marked offline, and return a banned notice immediately.
      try {
        await pool.query("UPDATE users SET is_online = false WHERE id = $1", [decoded.id]);
      } catch (_) {}
      return reply.send({ status: "banned", banReason: (user.ban_reason || "").toString() });
    }

    // Normal heartbeat update + deliver any unread admin messages
    await pool.query("UPDATE users SET is_online = true, last_seen = $1 WHERE id = $2", [Date.now(), decoded.id]);

    const msgResult = await pool.query(
      `SELECT id, subject, message, created_at
       FROM admin_messages
       WHERE user_id = $1 AND is_read = false
       ORDER BY created_at ASC`,
      [decoded.id]
    );
    const messages = msgResult.rows || [];

    if (messages.length) {
      const ids = messages.map((m) => m.id);
      await pool.query(
        `UPDATE admin_messages SET is_read = true WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    return reply.send({ status: "ok", messages });
  } catch (err) {
    // If token decode fails, return 401
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.post("/offline", async (request, reply) => {
  const token = getBearerToken(request) || request.body?.token;

  if (!token) {
    return reply.code(401).send();
  }

  try {
    const decoded = verifyToken(token);

    if (decoded) {
      await pool.query(
        `UPDATE users
         SET is_online = false
         WHERE id = $2`,
        [Date.now(), decoded.id]
      );
    }
  } catch {}

  return reply.code(200).send();
});

fastify.post("/requests", async (request, reply) => {
  const token = getBearerToken(request);

  if (!token) {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }

  const { requestType, subject, details, pageUrl } = request.body ?? {};

  if (!requestType || !subject || !details) {
    return reply.code(400).send({
      error: "Request type, subject, and details are required.",
    });
  }

  try {
    const decoded = await verifyActiveToken(token);

    const userLookup = await pool.query("SELECT username FROM users WHERE id = $1", [decoded.id]);

    const username = userLookup.rows[0]?.username || "Unknown User";

    await pool.query(
      `INSERT INTO request_submissions
       (user_id, username, request_type, subject, details, page_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [decoded.id, username, requestType, subject.trim(), details.trim(), (pageUrl || "").trim()]
    );

    return reply.send({
      message: "Your request was submitted successfully.",
    });
  } catch {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }
});

fastify.get("/custom-games", async (request, reply) => {
  const token = getBearerToken(request);

  if (!token) {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }

  try {
    const decoded = await verifyActiveToken(token);

    const result = await pool.query(
      `SELECT id, name, game_type, target_url,
              html_code, icon_data, is_published
       FROM custom_games
       WHERE user_id = $1
       ORDER BY id ASC`,
      [decoded.id]
    );

    const games = result.rows.map((row) => ({
      name: row.name || "",
      customId: `cg-${row.id}`,
      type: row.game_type === "html" ? "html" : "url",
      url: row.target_url || "",
      html: row.html_code || "",
      icon: row.icon_data || "",
      published: Boolean(row.is_published),
    }));

    return reply.send({ games });
  } catch {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }
});

fastify.post("/custom-games", async (request, reply) => {
  const token = getBearerToken(request);

  if (!token) {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }

  const { games } = request.body ?? {};

  if (!Array.isArray(games)) {
    return reply.code(400).send({
      error: "Games array is required.",
    });
  }

  try {
    const decoded = await verifyActiveToken(token);

    await pool.query("DELETE FROM custom_games WHERE user_id = $1", [decoded.id]);

    for (const game of games) {
      const name = String(game?.name || "").trim().slice(0, 255);
      const gameType = game?.type === "html" ? "html" : "url";
      const targetUrl = String(game?.url || "").trim();
      const htmlCode = String(game?.html || "").trim();
      const iconData = String(game?.icon || "").trim();
      const published = Boolean(game?.published);

      if (!name) continue;

      await pool.query(
        `INSERT INTO custom_games
         (user_id, name, game_type, target_url,
          html_code, icon_data, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [decoded.id, name, gameType, targetUrl, htmlCode, iconData, published]
      );
    }

    return reply.send({
      message: "Custom games saved.",
    });
  } catch {
    return reply.code(401).send({
      error: "Unauthorized",
    });
  }
});

fastify.get("/public-games", async (_request, reply) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.user_id, g.name,
              g.game_type, g.target_url,
              g.html_code, g.icon_data,
              u.username
       FROM custom_games g
       LEFT JOIN users u ON u.id = g.user_id
       WHERE g.is_published = true
       ORDER BY g.id DESC`
    );

    const games = result.rows.map((row) => ({
      customId: `cg-${row.id}`,
      ownerId: row.user_id,
      ownerUsername: row.username || "Unknown User",
      name: row.name || "",
      type: row.game_type === "html" ? "html" : "url",
      url: row.target_url || "",
      html: row.html_code || "",
      icon: row.icon_data || "",
      published: true,
    }));

    return reply.send({ games });
  } catch {
    return reply.code(500).send({
      error: "Database error",
    });
  }
});

fastify.get("/admin/users", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role,
              is_approved, is_banned,
              ban_reason, is_online
       FROM users
       ORDER BY id ASC`
    );

    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({
      error: "Database error",
    });
  }
});

fastify.get("/admin/requests", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      `SELECT id, username, request_type,
              subject, details, page_url,
              created_at
       FROM request_submissions
       ORDER BY created_at DESC, id DESC`
    );

    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({
      error: "Database error",
    });
  }
});

fastify.post("/admin/action", { preHandler: verifyAdmin }, async (request, reply) => {
  const { userId, action, reason } = request.body ?? {};

  try {
    if (action === "ban") {
      const safeReason = (reason || "").toString().trim() || "No reason provided";

      // Ban and ensure the user is marked offline immediately.
      await pool.query("UPDATE users SET is_banned = true, is_online = false, ban_reason = $1 WHERE id = $2", [safeReason, userId]);
    }

    if (action === "unban") {
      await pool.query("UPDATE users SET is_banned = false, ban_reason = '' WHERE id = $1", [userId]);
    }

    return reply.send({
      message: "Success",
    });
  } catch {
    return reply.code(500).send({
      error: "Database error",
    });
  }
});

fastify.get("/admin/custom-games", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.user_id, u.username,
              g.name, g.game_type,
              g.target_url, g.is_published,
              g.created_at
       FROM custom_games g
       LEFT JOIN users u ON u.id = g.user_id
       ORDER BY g.id DESC`
    );

    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({
      error: "Database error",
    });
  }
});

fastify.post("/admin/custom-games/action", { preHandler: verifyAdmin }, async (request, reply) => {
  const { gameId, action } = request.body ?? {};

  const parsedGameId = Number(gameId);

  if (!Number.isInteger(parsedGameId) || parsedGameId <= 0) {
    return reply.code(400).send({
      error: "Valid gameId is required.",
    });
  }

  try {
    if (action === "publish") {
      await pool.query("UPDATE custom_games SET is_published = true WHERE id = $1", [parsedGameId]);

      return reply.send({
        message: "Game published.",
      });
    }

    if (action === "unpublish") {
      await pool.query("UPDATE custom_games SET is_published = false WHERE id = $1", [parsedGameId]);

      return reply.send({
        message: "Game unpublished.",
      });
    }

    if (action === "delete") {
      await pool.query("DELETE FROM custom_games WHERE id = $1", [parsedGameId]);

      return reply.send({
        message: "Game deleted.",
      });
    }

    return reply.code(400).send({
      error: "Invalid action.",
    });
  } catch {
    return reply.code(500).send({
      error: "Database error",
    });
  }
});

function sanitizeAiMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-12)
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : "user";

      const content = String(message?.content || "").trim().slice(0, 2000);

      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

fastify.post("/ai/chat", async (request, reply) => {
  const token = getBearerToken(request);

  if (!token) {
    return reply.code(401).send({
      error: "Please log in to use Tempest AI.",
    });
  }

  try {
    await verifyActiveToken(token);
  } catch {
    return reply.code(401).send({
      error: "Please log in again to use Tempest AI.",
    });
  }

  if (!GROQ_API_KEY) {
    return reply.code(503).send({
      error: "Tempest AI needs a GROQ_API_KEY environment variable on the server.",
    });
  }

  const messages = sanitizeAiMessages(request.body?.messages);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return reply.code(400).send({
      error: "Send a message for Tempest AI to answer.",
    });
  }

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Unbreaking AI inside the Unbreaking site. The link to the site you are on is https://unbreakingone.onrender.com Be smart, helpful, concise, and friendly.",
          },
          ...messages,
        ],
        temperature: 0.65,
        max_completion_tokens: 900,
      }),
    });

    const data = await groqResponse.json().catch(() => ({}));

    if (!groqResponse.ok) {
      return reply.code(groqResponse.status).send({
        error: data?.error?.message || "Unbreaking AI could not answer right now.",
      });
    }

    const replyText = data?.choices?.[0]?.message?.content?.trim();

    if (!replyText) {
      return reply.code(502).send({
        error: "Unbreaking AI returned an empty answer.",
      });
    }

    return reply.send({
      reply: replyText,
      model: data?.model || GROQ_MODEL,
    });
  } catch {
    return reply.code(502).send({
      error: "Could not reach Unbreaking AI right now.",
    });
  }
});

fastify.get("/", async (_request, reply) => {
  return reply.sendFile("index.html");
});

fastify.get("/p", async (_request, reply) => {
  return reply.type("text/html").sendFile("proxy.html");
});

fastify.get("/music-files", async (_request, reply) => {
  try {
    const musicDir = path.join(publicPath, "music");

    const items = await fs.promises.readdir(musicDir, { withFileTypes: true });

    const files = items
      .filter((item) => item.isFile())
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));

    return reply.send({
      files,
    });
  } catch {
    return reply.code(500).send({
      error: "Could not load music files.",
    });
  }
});

fastify.get("/proxy", async (_request, reply) => {
  return reply.redirect(301, "/p");
});

fastify.get("/app/*", async (request, reply) => {
  const appPath = request.params["*"] || "";

  return reply.redirect(301, `/game/${appPath}`);
});

fastify.setNotFoundHandler((request, reply) => {
  const pathname = request.raw.url?.split("?")[0] ?? "";

  const decodedPath = decodeURIComponent(pathname);

  const isStartupProxyPath = /^(?:\/p)?\/search\/.+/i.test(decodedPath);

  const lastPathSegment = pathname.split("/").pop() ?? "";

  const hasFileExtension = /\.[a-z0-9]{2,8}$/i.test(lastPathSegment);

  const normalizedPath = decodedPath.replace(/^\/+/, "");

  if (
    pathname.startsWith("/admin/") ||
    pathname === "/auth/google" ||
    pathname === "/heartbeat" ||
    pathname === "/offline" ||
    pathname === "/requests" ||
    pathname === "/ai/chat" ||
    pathname === "/custom-games" ||
    pathname === "/public-games"
  ) {
    return reply.code(404).send({
      error: "Not Found",
    });
  }

  if (isStartupProxyPath) {
    return reply.type("text/html").sendFile("proxy.html");
  }

  if (!hasFileExtension && normalizedPath) {
    const htmlFileCandidate = `${normalizedPath}.html`;

    const htmlFilePath = path.join(publicPath, htmlFileCandidate);

    if (fs.existsSync(htmlFilePath)) {
      return reply.type("text/html").sendFile(htmlFileCandidate);
    }
  }

  if (!hasFileExtension) {
    return reply.type("text/html").sendFile("index.html");
  }

  return reply.code(404).type("text/html").sendFile("404.html");
});

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
