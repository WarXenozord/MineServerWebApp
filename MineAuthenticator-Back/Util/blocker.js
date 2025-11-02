import fs from "fs";
import path from "path";

const __dirname = path.resolve();

const BLOCKED_FILE = path.join(__dirname, "Logs", "blocked-ips.json");
const HONEY_LOG = path.join(__dirname, "Logs", "honeypot.log");
const BRUTEFORCE_LOG = path.join(__dirname, "Logs", "bruteforce.log");

// ---- Persistent blocked IPs ----
let blockedIPs = new Set();
try {
  if (fs.existsSync(BLOCKED_FILE)) {
    const data = JSON.parse(fs.readFileSync(BLOCKED_FILE, "utf8"));
    data.forEach(ip => blockedIPs.add(ip));
  }
} catch (e) {
  console.error("failed loading blocked ips", e);
}

function persistBlocked() {
  try {
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify([...blockedIPs], null, 2));
  } catch (e) {
    console.error("persist blocked failed", e);
  }
}

// ---- In-memory counters ----
const failedLoginByUser = new Map();
const failedLoginByIp = new Map();
const honeypotHits = new Map();

// ---- Config ----
const USER_ATTEMPT_LIMIT = 10;
const USER_ATTEMPT_WINDOW = 60 * 60 * 1000;

const IP_ATTEMPT_LIMIT = 5;
const IP_ATTEMPT_WINDOW = 60 * 60 * 1000;

const HONEYPOT_THRESHOLD = 3;

// ---- Helpers ----
export function clientIpFromReq(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff && typeof xff === "string") return xff.split(",")[0].trim();
  if (req.socket?.remoteAddress) return req.socket.remoteAddress;
  return req.ip || "unknown";
}

function pruneOld(arr, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (arr.length && arr[0] < cutoff) arr.shift();
}

// ---- Brute-force limiter ----
export function checkRateLimit(username, ip) {
  if (blockedIPs.has(ip)) return { ok: false, reason: "blocked" };

  if (username) {
    if (!failedLoginByUser.has(username)) failedLoginByUser.set(username, []);
    const arr = failedLoginByUser.get(username);
    pruneOld(arr, USER_ATTEMPT_WINDOW);
    if (arr.length >= USER_ATTEMPT_LIMIT) {
        fs.appendFileSync(BRUTEFORCE_LOG, `${new Date().toISOString()} BLOCKED ${username} after ${arr.length} hits by ${ip}\n`);
        return { ok: false, reason: "user-limit" };
    }
  }

  if (!failedLoginByIp.has(ip)) failedLoginByIp.set(ip, []);
  const arrIp = failedLoginByIp.get(ip);
  pruneOld(arrIp, IP_ATTEMPT_WINDOW);
  if (arrIp.length >= IP_ATTEMPT_LIMIT) {
    fs.appendFileSync(BRUTEFORCE_LOG, `${new Date().toISOString()} BLOCKED ${ip} after ${arrIp.length} hits\n`);
    return { ok: false, reason: "ip-limit" };
  }

  return { ok: true };
}

export function recordFailedAttempt(username, ip) {
  const now = Date.now();
  if (username) {
    if (!failedLoginByUser.has(username)) failedLoginByUser.set(username, []);
    failedLoginByUser.get(username).push(now);
  }
  if (!failedLoginByIp.has(ip)) failedLoginByIp.set(ip, []);
  failedLoginByIp.get(ip).push(now);
}

export function recordSuccessfulLogin(username, ip) {
  if (username) failedLoginByUser.delete(username);
}

// ---- Honeypot logic ----
export function checkHoneypot(req, ip) {
  const val = req.body?.website;
  if (val && typeof val === "string" && val.trim() !== "") {
    const ua = req.headers["user-agent"] || "";
    const t = new Date().toISOString();
    const logLine = `${t} HONEYPOT ${ip} UA:${ua} body:${JSON.stringify({ website: val })}\n`;
    try {
      fs.appendFileSync(HONEY_LOG, logLine);
    } catch (e) {
      console.error("honeypot log error", e);
    }

    const hits = (honeypotHits.get(ip) || 0) + 1;
    honeypotHits.set(ip, hits);

    if (hits >= HONEYPOT_THRESHOLD) {
      blockedIPs.add(ip);
      persistBlocked();
      try {
        fs.appendFileSync(HONEY_LOG, `${new Date().toISOString()} BLOCKED ${ip} after ${hits} hits\n`);
      } catch (e) {
        console.error(e);
      }
    }
    return { tripped: true };
  }
  return { tripped: false };
}

// ---- Middleware for global IP blocking ----
export function blockMiddleware(req, res, next) {
  const ip = clientIpFromReq(req);
  if (blockedIPs.has(ip)) return res.status(403).send("Forbidden");
  next();
}