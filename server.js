const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";

const requiredEnv = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME"
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.warn(
    `Faltan variables de entorno: ${missing.join(", ")}. Revisa el archivo .env.`
  );
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

    const key = `uploads/${keyPath}`;

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
      region: process.env.AWS_REGION
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
