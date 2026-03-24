const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const progressEl = document.getElementById("progress");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const objectLink = document.getElementById("objectLink");

let selectedFiles = [];

function getRelativePath(file) {
  return file.webkitRelativePath || file.name;
}

function resetOutput() {
  statusEl.textContent = "";
  summaryEl.textContent = "";
  objectLink.textContent = "";
  objectLink.removeAttribute("href");
}

fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files ?? []);
  uploadBtn.disabled = selectedFiles.length === 0;

  if (selectedFiles.length === 0) {
    resetOutput();
    statusEl.textContent = "Selecciona una imagen o una carpeta.";
    return;
  }

  const folderCount = new Set(
    selectedFiles
      .map((file) => file.webkitRelativePath)
      .filter(Boolean)
      .map((relativePath) => relativePath.split("/")[0])
  ).size;

  statusEl.textContent = `${selectedFiles.length} archivo(s) listo(s) para subir.`;
  summaryEl.textContent = selectedFiles.some((file) => file.webkitRelativePath)
    ? `Se mantendrá la estructura de carpetas detectada${folderCount ? ` en ${folderCount} carpeta(s)` : ""}.`
    : "Se mantendrá el nombre original de cada archivo.";
});

uploadBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) return;

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

      statusEl.textContent = `Solicitando URL firmada para ${relativePath}...`;

      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || null,
          relativePath
        })
      });

      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({}));
        throw new Error(data.error || `No se pudo firmar ${relativePath}`);
      }

      const { uploadUrl, key } = await presignRes.json();

      statusEl.textContent = `Subiendo ${relativePath}...`;

      const headers = {};
      if (file.type) {
        headers["Content-Type"] = file.type;
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
    summaryEl.textContent = `${uploadedKeys.length} archivo(s) subido(s) manteniendo estructura y nombres.`;
    objectLink.textContent = uploadedKeys.length ? `Último objeto subido: ${uploadedKeys.at(-1)}` : "";
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  } finally {
    uploadBtn.disabled = selectedFiles.length === 0;
    setTimeout(() => {
      progressEl.hidden = true;
      progressEl.value = 0;
    }, 1000);
  }
});
