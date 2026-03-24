# Foto Uploader a AWS S3

Aplicación web sencilla para subir imágenes a un bucket S3 con **URL firmada**.
La app permite seleccionar archivos o carpetas completas y conserva la estructura original en la raíz del bucket.

## Requisitos

- Node.js 18+
- Una cuenta AWS
- Un bucket S3 creado
- Un usuario IAM con permiso de `s3:PutObject` sobre ese bucket

## 1) Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus datos:

```env
PORT=3000
HOST=127.0.0.1
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=TU_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=TU_SECRET_KEY
S3_BUCKET_NAME=tu-bucket
```

## 2) Permisos IAM mínimos

Usa una policy como esta (cambiando el nombre del bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
        "Resource": "arn:aws:s3:::tu-bucket/*"
    }
  ]
}
```

## 3) CORS del bucket S3

En tu bucket, en la configuración de CORS, añade:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## 4) Instalar y ejecutar

```bash
npm install
npm run dev
```

Abre: [http://localhost:3000](http://localhost:3000)

## Flujo de subida

1. El frontend envía `fileName`, `fileType` y la ruta relativa del archivo al backend.
2. El backend genera una URL firmada (`PUT`) para S3 usando la ruta original.
3. El frontend sube el archivo directamente a S3 usando esa URL sin renombrarlo.

## Nota sobre acceso al archivo

La app muestra la URL estándar del objeto en S3.  
Si tu bucket es privado (recomendado), abrir esa URL puede devolver `403`.
