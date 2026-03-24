const path = require("path");
const crypto = require("crypto");
const express = require("express");
const dotenv = require("dotenv");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
const authPassword = process.env.APP_PASSWORD || "";
const authSecret = process.env.APP_AUTH_SECRET || "";

const requiredEnv = [
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME"
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.warn(
    `Faltan variables de entorno: ${missing.join(", ")}. Revisa el archivo .env.`
  );
}

const s3 = new S3Client({
  region: process.env.S3_REGION || process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || ""
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parseCookieHeader(cookieHeader) {
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

function createSessionToken() {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = JSON.stringify({ expiresAt });
  const body = base64UrlEncode(payload);
  const signature = crypto
    .createHmac("sha256", authSecret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifySessionToken(token) {
  if (!authSecret || !authPassword || typeof token !== "string") {
    return false;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", authSecret)
    .update(body)
    .digest("base64url");

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    return Boolean(payload.expiresAt && Date.now() <= payload.expiresAt);
  } catch {
    return false;
  }
}

function buildAuthCookie(token) {
  return `fu_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

function buildClearAuthCookie() {
  return "fu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function requireAuth(req, res) {
  const cookies = parseCookieHeader(req.headers.cookie);
  if (!verifySessionToken(cookies.fu_session)) {
    res.status(401).json({ error: "No autorizado" });
    return false;
  }
  return true;
}

app.post("/api/auth/login", (req, res) => {
  if (!authPassword || !authSecret) {
    return res.status(500).json({
      error: "Faltan variables APP_PASSWORD o APP_AUTH_SECRET"
    });
  }

  const submittedPassword = String(req.body?.password || "");
  if (submittedPassword !== authPassword) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  return res
    .set("Set-Cookie", buildAuthCookie(createSessionToken()))
    .json({ authenticated: true });
});

app.get("/api/auth/session", (req, res) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  res.json({ authenticated: verifySessionToken(cookies.fu_session) });
});

app.post("/api/auth/logout", (_req, res) => {
  return res.set("Set-Cookie", buildClearAuthCookie()).json({ ok: true });
});

function sanitizeRelativeKey(relativePath) {
  if (typeof relativePath !== "string") {
    return null;
  }

  const trimmed = relativePath.trim().replace(/^\/+/, "");
  if (!trimmed) {
    return null;
  }

  const normalized = path.posix.normalize(trimmed.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    return null;
  }

  return normalized;
}

function inferImageContentType(fileName) {
  const extension = path.posix.extname(String(fileName).toLowerCase());

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".avif":
      return "image/avif";
    case ".heic":
      return "image/heic";
    default:
      return null;
  }
}

app.post("/api/s3/presign", async (req, res) => {
  try {
    if (!requireAuth(req, res)) {
      return;
    }

    const { fileName, fileType, relativePath } = req.body || {};

    if (!fileName) {
      return res.status(400).json({
        error: "Debes enviar fileName"
      });
    }

    const keyPath = sanitizeRelativeKey(relativePath) || sanitizeRelativeKey(fileName);
    if (!keyPath) {
      return res.status(400).json({
        error: "La ruta del archivo no es valida"
      });
    }

    const resolvedContentType = fileType || inferImageContentType(keyPath);
    if (!resolvedContentType || !resolvedContentType.startsWith("image/")) {
      return res.status(400).json({
        error: "Solo se permiten imagenes"
      });
    }

    const key = keyPath;

    const commandInput = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    };

    if (resolvedContentType) {
      commandInput.ContentType = resolvedContentType;
    }

    const command = new PutObjectCommand(commandInput);

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    res.json({
      uploadUrl,
      key,
      bucket: process.env.S3_BUCKET_NAME,
      region: process.env.S3_REGION || process.env.AWS_REGION
    });
  } catch (error) {
    console.error("Error generando URL firmada:", error);
    res.status(500).json({
      error: "No se pudo generar la URL firmada"
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, host, () => {
  console.log(`Servidor listo en http://${host}:${port}`);
});
