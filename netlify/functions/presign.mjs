import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSessionFromRequest } from "./_auth.mjs";

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

function inferVideoContentType(fileName) {
  const extension = path.posix.extname(String(fileName).toLowerCase());

  switch (extension) {
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".m4v":
      return "video/x-m4v";
    case ".avi":
      return "video/x-msvideo";
    case ".mkv":
      return "video/x-matroska";
    case ".wmv":
      return "video/x-ms-wmv";
    case ".mpeg":
    case ".mpg":
      return "video/mpeg";
    default:
      return null;
  }
}

function inferMediaContentType(fileName) {
  return inferImageContentType(fileName) || inferVideoContentType(fileName);
}

function inferMediaKind(fileName, contentType) {
  const resolvedContentType =
    contentType && (contentType.startsWith("image/") || contentType.startsWith("video/"))
      ? contentType
      : inferMediaContentType(fileName);
  if (!resolvedContentType) {
    return null;
  }

  if (resolvedContentType.startsWith("image/")) {
    return "image";
  }

  if (resolvedContentType.startsWith("video/")) {
    return "video";
  }

  return null;
}

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

const region = getEnv("S3_REGION", ["AWS_REGION"]);
const accessKeyId = getEnv("S3_ACCESS_KEY_ID", ["AWS_ACCESS_KEY_ID"]);
const secretAccessKey = getEnv("S3_SECRET_ACCESS_KEY", ["AWS_SECRET_ACCESS_KEY"]);
const imageBucketName = getEnv("S3_IMAGE_BUCKET_NAME");
const videoBucketName = getEnv("S3_VIDEO_BUCKET_NAME");
const configuredPresignExpiresIn = Number.parseInt(getEnv("S3_PRESIGN_EXPIRES_IN"), 10);
const uploadUrlTtl = Number.isFinite(configuredPresignExpiresIn)
  ? Math.min(Math.max(configuredPresignExpiresIn, 60), 900)
  : 180;

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

export const config = {
  path: "/api/s3/presign"
};

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    if (!getSessionFromRequest(request)) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!imageBucketName || !videoBucketName || !region || !accessKeyId || !secretAccessKey) {
      return new Response(
        JSON.stringify({
          error:
            "Faltan variables de entorno: S3_IMAGE_BUCKET_NAME, S3_VIDEO_BUCKET_NAME, S3_REGION, S3_ACCESS_KEY_ID o S3_SECRET_ACCESS_KEY"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { fileName, fileType, relativePath, destination } = body;

    if (!fileName) {
      return new Response(JSON.stringify({ error: "Debes enviar fileName" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const keyPath = sanitizeRelativeKey(relativePath) || sanitizeRelativeKey(fileName);
    if (!keyPath) {
      return new Response(JSON.stringify({ error: "La ruta del archivo no es valida" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const mediaKind = inferMediaKind(keyPath, fileType);
    if (!mediaKind) {
      return new Response(JSON.stringify({ error: "Solo se permiten imagenes o videos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const key = keyPath;
    const selectedDestination = destination === "video" ? "video" : "image";
    const bucketName = selectedDestination === "video" ? videoBucketName : imageBucketName;
    const resolvedContentType =
      fileType && (fileType.startsWith("image/") || fileType.startsWith("video/"))
        ? fileType
        : inferMediaContentType(keyPath);

    if (selectedDestination !== mediaKind) {
      return new Response(
        JSON.stringify({
          error:
            selectedDestination === "video"
              ? "La carpeta o archivo no es un video válido"
              : "La carpeta o archivo no es una imagen válida"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: resolvedContentType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: uploadUrlTtl });

    return new Response(
      JSON.stringify({
        uploadUrl,
        key,
        bucket: bucketName,
        region,
        destination: selectedDestination
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error generando URL firmada:", error);
    return new Response(JSON.stringify({ error: "No se pudo generar la URL firmada" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
