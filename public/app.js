const authCard = document.getElementById("authCard");
const appCard = document.getElementById("appCard");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const authStatus = document.getElementById("authStatus");
const logoutBtn = document.getElementById("logoutBtn");
const destinationSelect = document.getElementById("destinationSelect");

const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");
const pickFilesBtn = document.getElementById("pickFilesBtn");
const pickFolderBtn = document.getElementById("pickFolderBtn");
const uploadBtn = document.getElementById("uploadBtn");
const progressEl = document.getElementById("progress");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const selectionEl = document.getElementById("selection");
const objectLink = document.getElementById("objectLink");

let selectedFiles = [];
let selectionMode = "none";
let authenticated = false;

const MEDIA_EXTENSIONS = {
  image: new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".avif", ".heic"]),
  video: new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".wmv", ".mpeg", ".mpg"])
};

const MEDIA_PREFIX = {
  image: "image/",
  video: "video/"
};

const MEDIA_LABELS = {
  image: "imágenes",
  video: "vídeos"
};

function getSelectedDestination() {
  return destinationSelect.value === "video" ? "video" : "image";
}

function updateAcceptedTypes() {
  const acceptValue = getSelectedDestination() === "video" ? "video/*" : "image/*";
  fileInput.setAttribute("accept", acceptValue);
  folderInput.setAttribute("accept", acceptValue);
}

function getRelativePath(file) {
  return file.webkitRelativePath || file.name;
}

function inferResolvedContentType(file) {
  const destination = getSelectedDestination();
  if (typeof file.type === "string" && file.type.startsWith(MEDIA_PREFIX[destination])) {
    return file.type;
  }

  const lowerName = file.name.toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }

  const extension = lowerName.slice(dotIndex);
  if (MEDIA_EXTENSIONS[destination].has(extension)) {
    return destination === "video"
      ? {
          ".mp4": "video/mp4",
          ".mov": "video/quicktime",
          ".webm": "video/webm",
          ".m4v": "video/x-m4v",
          ".avi": "video/x-msvideo",
          ".mkv": "video/x-matroska",
          ".wmv": "video/x-ms-wmv",
          ".mpeg": "video/mpeg",
          ".mpg": "video/mpeg"
        }[extension] || ""
      : {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".bmp": "image/bmp",
          ".tif": "image/tiff",
          ".tiff": "image/tiff",
          ".avif": "image/avif",
          ".heic": "image/heic"
        }[extension] || "";
  }

  return "";
}

function isSupportedMediaFile(file) {
  if (!file) return false;

  const destination = getSelectedDestination();
  const prefix = MEDIA_PREFIX[destination];
  if (typeof file.type === "string" && file.type.startsWith(prefix)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");
  if (dotIndex === -1) return false;

  return MEDIA_EXTENSIONS[destination].has(lowerName.slice(dotIndex));
}

function resetOutput() {
  statusEl.textContent = "";
  summaryEl.textContent = "";
  objectLink.textContent = "";
  objectLink.removeAttribute("href");
}

function updateSelectionLabel() {
  if (selectedFiles.length === 0) {
    selectionEl.textContent = "No hay archivos seleccionados.";
    return;
  }

  const label =
    selectionMode === "folder"
      ? "carpeta"
      : selectionMode === "files"
        ? "archivos sueltos"
        : "archivos";

  selectionEl.textContent = `${selectedFiles.length} archivo(s) seleccionado(s) desde ${label}.`;
}

function setSelection(files, mode) {
  const allFiles = Array.from(files ?? []);
  selectedFiles = allFiles.filter(isSupportedMediaFile);
  selectionMode = mode;
  uploadBtn.disabled = selectedFiles.length === 0;
  updateSelectionLabel();

  if (selectedFiles.length === 0) {
    resetOutput();
    statusEl.textContent = `Selecciona ${MEDIA_LABELS[getSelectedDestination()]} sueltos o una carpeta con ${MEDIA_LABELS[getSelectedDestination()]}.`;
    return;
  }

  const skippedFiles = allFiles.length - selectedFiles.length;
  const folderCount = new Set(
    selectedFiles
      .map((file) => file.webkitRelativePath)
      .filter(Boolean)
      .map((relativePath) => relativePath.split("/")[0])
  ).size;

  statusEl.textContent = `${selectedFiles.length} archivo(s) listo(s) para subir.`;
  summaryEl.textContent =
    mode === "folder" && selectedFiles.some((file) => file.webkitRelativePath)
      ? `Se mantendrá la estructura de carpetas detectada${folderCount ? ` en ${folderCount} carpeta(s)` : ""}.`
      : "Se mantendrá el nombre original de cada archivo.";

  if (skippedFiles > 0) {
    summaryEl.textContent += ` Se omitieron ${skippedFiles} archivo(s) que no correspondían al tipo seleccionado.`;
  }
}

function setAuthenticatedState(value) {
  authenticated = value;
  authCard.hidden = value;
  appCard.hidden = !value;
  if (value) {
    authStatus.textContent = "";
    passwordInput.value = "";
    updateAcceptedTypes();
  } else {
    selectedFiles = [];
    selectionMode = "none";
    uploadBtn.disabled = true;
    resetOutput();
    updateSelectionLabel();
  }
}

async function refreshSession() {
  const response = await fetch("/api/auth/session", {
    credentials: "include"
  });

  if (!response.ok) {
    setAuthenticatedState(false);
    return;
  }

  const data = await response.json().catch(() => ({}));
  setAuthenticatedState(Boolean(data.authenticated));
}

destinationSelect.addEventListener("change", () => {
  updateAcceptedTypes();
  selectedFiles = [];
  selectionMode = "none";
  uploadBtn.disabled = true;
  fileInput.value = "";
  folderInput.value = "";
  resetOutput();
  updateSelectionLabel();
  statusEl.textContent = `Destino cambiado a ${MEDIA_LABELS[getSelectedDestination()]}.`;
});

pickFilesBtn.addEventListener("click", () => {
  fileInput.click();
});

pickFolderBtn.addEventListener("click", () => {
  folderInput.click();
});

fileInput.addEventListener("change", () => {
  setSelection(fileInput.files, "files");
  folderInput.value = "";
});

folderInput.addEventListener("change", () => {
  setSelection(folderInput.files, "folder");
  fileInput.value = "";
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = passwordInput.value.trim();
  if (!password) {
    authStatus.textContent = "Introduce la contraseña.";
    return;
  }

  loginBtn.disabled = true;
  authStatus.textContent = "Comprobando credenciales...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "No se pudo iniciar sesión");
    }

    setAuthenticatedState(true);
  } catch (error) {
    authStatus.textContent = `Error: ${error.message}`;
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });
  } finally {
    setAuthenticatedState(false);
    logoutBtn.disabled = false;
  }
});

uploadBtn.addEventListener("click", async () => {
  if (!authenticated || selectedFiles.length === 0) return;

  const destination = getSelectedDestination();
  uploadBtn.disabled = true;
  progressEl.hidden = false;
  progressEl.value = 0;
  resetOutput();
  statusEl.textContent = "Preparando subida...";

  const uploadedKeys = [];

  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const relativePath = getRelativePath(file);
      const resolvedContentType = inferResolvedContentType(file);

      statusEl.textContent = `Solicitando URL firmada para ${relativePath}...`;

      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: resolvedContentType || null,
          relativePath,
          destination
        })
      });

      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({}));
        if (presignRes.status === 401) {
          setAuthenticatedState(false);
          throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
        }
        throw new Error(data.error || `No se pudo firmar ${relativePath}`);
      }

      const { uploadUrl, key } = await presignRes.json();

      statusEl.textContent = `Subiendo ${relativePath}...`;

      const headers = {};
      if (resolvedContentType) {
        headers["Content-Type"] = resolvedContentType;
      }

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: file
      });

      if (!uploadRes.ok) {
        throw new Error(`Error al subir ${relativePath}`);
      }

      uploadedKeys.push(key);
      progressEl.value = Math.round(((index + 1) / selectedFiles.length) * 100);
    }

    statusEl.textContent = "Subida completada con éxito.";
    summaryEl.textContent = `${uploadedKeys.length} archivo(s) subido(s) manteniendo estructura y nombres en el bucket de ${MEDIA_LABELS[destination]}.`;
    objectLink.textContent = uploadedKeys.length ? `Último objeto subido: ${uploadedKeys.at(-1)}` : "";
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  } finally {
    uploadBtn.disabled = authenticated && selectedFiles.length > 0;
    setTimeout(() => {
      progressEl.hidden = true;
      progressEl.value = 0;
    }, 1000);
  }
});

updateAcceptedTypes();
updateSelectionLabel();
refreshSession().catch(() => setAuthenticatedState(false));
