# Foto Uploader a AWS S3

Aplicación web sencilla para subir imágenes a un bucket S3 con **URL firmada**.
La app permite seleccionar archivos o carpetas completas y conserva la estructura original en la raíz del bucket.
En Netlify, el frontend se publica como sitio estático y el endpoint de firma vive en una Netlify Function.
Además, el acceso está protegido con una contraseña propia configurada por variables de entorno.
Ahora puedes elegir entre un bucket de imágenes y otro de vídeos.

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
S3_REGION=eu-west-1
S3_ACCESS_KEY_ID=TU_ACCESS_KEY
S3_SECRET_ACCESS_KEY=TU_SECRET_KEY
S3_IMAGE_BUCKET_NAME=tu-bucket-imagenes
S3_VIDEO_BUCKET_NAME=tu-bucket-videos
APP_PASSWORD=una_contraseña_larga
APP_AUTH_SECRET=una_clave_secreta_larga_y_aleatoria
S3_PRESIGN_EXPIRES_IN=180
```

## 2) Permisos IAM mínimos

Usa una policy como esta en el usuario IAM que usará la Function:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::tu-bucket-imagenes/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::tu-bucket-videos/*"
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

## Variables en Netlify

No uses `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` ni `AWS_REGION` en Netlify para esta app.
Usa estos nombres personalizados:

```env
S3_REGION=eu-west-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_IMAGE_BUCKET_NAME=...
S3_VIDEO_BUCKET_NAME=...
APP_PASSWORD=...
APP_AUTH_SECRET=...
S3_PRESIGN_EXPIRES_IN=180
```

## Acceso privado

La aplicación pide una contraseña antes de mostrar el formulario de subida.
La sesión se guarda en una cookie firmada y expira automáticamente.

## Nota sobre acceso al archivo

La app muestra la URL estándar del objeto en S3.  
Si tu bucket es privado (recomendado), abrir esa URL puede devolver `403`.
