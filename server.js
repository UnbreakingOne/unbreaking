import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pkg from "pg";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import scramjetPathModule from "@mercuryworkshop/scramjet/path";
import { libcurlPath as importedLibcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath as importedBaremuxPath } from "@mercuryworkshop/bare-mux/node";

const { Pool } = pkg;
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

const NEON_URL =
  process.env.NEON_URL

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

const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false },
});

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

  console.log("Connected to Neon DB!");
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

function getBearerToken(request) {
  return request.headers.authorization?.split(" ")[1];
}

function verifyToken(token) {
  return jwt.verify(token, SECRET_KEY, { ignoreExpiration: true });
}

async function verifyActiveToken(token) {
  const decoded = verifyToken(token);
  const result = await pool.query(
    "SELECT is_online, session_expires_at, reauth_required FROM users WHERE id = $1",
    [decoded.id]
  );
  const user = result.rows[0];

  if (!user) throw new Error("User not found");
  if (user.reauth_required) throw new Error("Reauthentication required");

  if (Number(user.session_expires_at) <= Date.now() && !user.is_online) {
    await pool.query("UPDATE users SET reauth_required = true WHERE id = $1", [decoded.id]);
    throw new Error("Reauthentication required");
  }

  return decoded;
}

async function verifyAdmin(request, reply) {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

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

  if (!response.ok) throw new Error("Google token verification failed");

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
    const result = await pool.query(
      "SELECT id FROM users WHERE username = $1 AND id <> $2",
      [username, currentUserId || 0]
    );
    if (!result.rows.length) return username;

    const suffixText = ` ${suffix}`;
    username = `${baseName.slice(0, 255 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
}

fastify.post("/auth/google", async (request, reply) => {
  const { credential } = request.body ?? {};

  if (!credential) {
    return reply.code(400).send({ error: "Google sign-in is required." });
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
         SET google_subject = $1, username = $2, is_approved = true, is_online = true, last_seen = $3,
             session_expires_at = $4, reauth_required = false,
             role = CASE WHEN $5 THEN 'admin' ELSE role END
         WHERE id = $6`,
        [googleUser.sub, username, Date.now(), sessionExpiresAt, admin, user.id]
      );
      user.username = username;
      if (admin) user.role = "admin";
    } else {
      const placeholderPassword = await bcrypt.hash(crypto.randomUUID(), 10);
      const created = await pool.query(
        `INSERT INTO users (username, email, password, google_subject, role, is_approved, is_online, last_seen, session_expires_at, reauth_required)
         VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, false) RETURNING *`,
        [username, googleUser.email, placeholderPassword, googleUser.sub, admin ? "admin" : "user", Date.now(), sessionExpiresAt]
      );
      user = created.rows[0];
    }

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY);
    return reply.send({ token, role: user.role, username: user.username });
  } catch (err) {
    if (err.code === "23505") {
      return reply.code(400).send({ error: "That username is already in use." });
    }
    return reply.code(401).send({ error: "Google sign-in could not be verified." });
  }
});

fastify.post("/heartbeat", async (request, reply) => {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "No token" });

  try {
    const decoded = await verifyActiveToken(token);

    await pool.query("UPDATE users SET is_online = true, last_seen = $1 WHERE id = $2", [
      Date.now(),
      decoded.id,
    ]);

    return reply.send({ status: "ok" });
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.post("/offline", async (request, reply) => {
  const token = getBearerToken(request) || request.body?.token;
  if (!token) return reply.code(401).send();

  try {
    const decoded = verifyToken(token);
    if (decoded) {
      await pool.query(
        `UPDATE users
         SET is_online = false,
             reauth_required = CASE WHEN session_expires_at <= $1 THEN true ELSE reauth_required END
         WHERE id = $2`,
        [Date.now(), decoded.id]
      );
    }
  } catch {}

  return reply.code(200).send();
});

fastify.post("/requests", async (request, reply) => {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

  const { requestType, subject, details, pageUrl } = request.body ?? {};
  if (!requestType || !subject || !details) {
    return reply
      .code(400)
      .send({ error: "Request type, subject, and details are required." });
  }

  try {
    const decoded = await verifyActiveToken(token);

    const userLookup = await pool.query("SELECT username FROM users WHERE id = $1", [decoded.id]);
    const username = userLookup.rows[0]?.username || "Unknown User";

    await pool.query(
      `INSERT INTO request_submissions (user_id, username, request_type, subject, details, page_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [decoded.id, username, requestType, subject.trim(), details.trim(), (pageUrl || "").trim()]
    );

    return reply.send({ message: "Your request was submitted successfully." });
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.get("/custom-games", async (request, reply) => {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

  try {
    const decoded = await verifyActiveToken(token);
    const result = await pool.query(
      `SELECT id, name, game_type, target_url, html_code, icon_data, is_published
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
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.post("/custom-games", async (request, reply) => {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

  const { games } = request.body ?? {};
  if (!Array.isArray(games)) {
    return reply.code(400).send({ error: "Games array is required." });
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
        `INSERT INTO custom_games (user_id, name, game_type, target_url, html_code, icon_data, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [decoded.id, name, gameType, targetUrl, htmlCode, iconData, published]
      );
    }

    return reply.send({ message: "Custom games saved." });
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.get("/public-games", async (_request, reply) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.user_id, g.name, g.game_type, g.target_url, g.html_code, g.icon_data, u.username
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
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.get("/admin/users", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, is_approved, is_banned, ban_reason, is_online FROM users ORDER BY id ASC"
    );
    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.get("/admin/requests", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      "SELECT id, username, request_type, subject, details, page_url, created_at FROM request_submissions ORDER BY created_at DESC, id DESC"
    );
    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.post("/admin/action", { preHandler: verifyAdmin }, async (request, reply) => {
  const { userId, action, reason } = request.body ?? {};

  try {
    if (action === "ban") {
      const safeReason = (reason || "").toString().trim() || "No reason provided";
      await pool.query(
        "UPDATE users SET is_banned = true, is_online = false, ban_reason = $1 WHERE id = $2",
        [safeReason, userId]
      );
    }

    if (action === "unban") {
      await pool.query("UPDATE users SET is_banned = false, ban_reason = '' WHERE id = $1", [
        userId,
      ]);
    }

    return reply.send({ message: "Success" });
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.get("/admin/custom-games", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.user_id, u.username, g.name, g.game_type, g.target_url, g.is_published, g.created_at
       FROM custom_games g
       LEFT JOIN users u ON u.id = g.user_id
       ORDER BY g.id DESC`
    );

    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.post("/admin/custom-games/action", { preHandler: verifyAdmin }, async (request, reply) => {
  const { gameId, action } = request.body ?? {};
  const parsedGameId = Number(gameId);

  if (!Number.isInteger(parsedGameId) || parsedGameId <= 0) {
    return reply.code(400).send({ error: "Valid gameId is required." });
  }

  try {
    if (action === "publish") {
      await pool.query("UPDATE custom_games SET is_published = true WHERE id = $1", [
        parsedGameId,
      ]);
      return reply.send({ message: "Game published." });
    }

    if (action === "unpublish") {
      await pool.query("UPDATE custom_games SET is_published = false WHERE id = $1", [
        parsedGameId,
      ]);
      return reply.send({ message: "Game unpublished." });
    }

    if (action === "delete") {
      await pool.query("DELETE FROM custom_games WHERE id = $1", [parsedGameId]);
      return reply.send({ message: "Game deleted." });
    }

    return reply.code(400).send({ error: "Invalid action." });
  } catch {
    return reply.code(500).send({ error: "Database error" });
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
  if (!token) return reply.code(401).send({ error: "Please log in to use Tempest AI." });

  try {
    await verifyActiveToken(token);
  } catch {
    return reply.code(401).send({ error: "Please log in again to use Tempest AI." });
  }

  if (!GROQ_API_KEY) {
    return reply.code(503).send({
      error: "Tempest AI needs a GROQ_API_KEY environment variable on the server.",
    });
  }

  const messages = sanitizeAiMessages(request.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return reply.code(400).send({ error: "Send a message for Tempest AI to answer." });
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
              "You are Unbreaking AI inside the Unbreaking site. The link to the site you are on is https://unbreakingone.onrender.com Be smart, helpful, concise, and friendly. You will help the user with whatever help they need. If the user asks for code, put every code sample in fenced Markdown code blocks with the language name so the site can show copy buttons. Give working code and explain exactly where it goes. Do not claim to do things outside this chat unless the site gives you a tool for it.",
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
      return reply.code(502).send({ error: "Unbreaking AI returned an empty answer." });
    }

    return reply.send({ reply: replyText, model: data?.model || GROQ_MODEL });
  } catch {
    return reply.code(502).send({ error: "Could not reach Unbreaking AI right now." });
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
    return reply.send({ files });
  } catch {
    return reply.code(500).send({ error: "Could not load music files." });
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
  const pathname = request.raw.url?.split("?")[0] ?? "/";
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
    return reply.code(404).send({ error: "Not Found" });
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
