import crypto from "node:crypto";

function getEnv(name, fallbackNames = []) {
  if (process.env[name]) {
    return process.env[name];
  }

  for (const fallback of fallbackNames) {
    if (process.env[fallback]) {
      return process.env[fallback];
    }
  }

  return "";
}

function getAuthSecret() {
  return getEnv("APP_AUTH_SECRET");
}

function getAuthPassword() {
  return getEnv("APP_PASSWORD");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createSessionToken() {
  const secret = getAuthSecret();
  const password = getAuthPassword();

  if (!secret || !password) {
    throw new Error("Missing APP_AUTH_SECRET or APP_PASSWORD");
  }

  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = JSON.stringify({ expiresAt });
  const body = base64UrlEncode(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");

  return `${body}.${signature}`;
}

export function verifySessionToken(token) {
  const secret = getAuthSecret();
  const password = getAuthPassword();

  if (!secret || !password || typeof token !== "string") {
    return false;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return false;
  }

  const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parseCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
    return {};
  }

  return cookieHeader.split(";").reduce((acc, pair) => {
    const [rawKey, ...rawValue] = pair.split("=");
    const key = rawKey.trim();
    const value = rawValue.join("=").trim();
    if (key) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function getSessionFromRequest(request) {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return verifySessionToken(cookies.fu_session);
}

export function buildAuthCookie(token) {
  return `fu_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

export function buildClearAuthCookie() {
  return "fu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}
