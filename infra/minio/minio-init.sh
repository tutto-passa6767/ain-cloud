#!/bin/sh
# Создание приватных бакетов AIN Cloud и включение шифрования по умолчанию (SSE-S3, AES-256).
set -eu

mc alias set ain http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

for bucket in "$ORIGINALS" "$DERIVED"; do
  mc mb --ignore-existing "ain/$bucket"
  # Никакого анонимного доступа: файлы отдаются только по подписанным ссылкам после проверки прав
  mc anonymous set none "ain/$bucket"
  mc encrypt set sse-s3 "ain/$bucket"
done

echo "MinIO: бакеты $ORIGINALS и $DERIVED готовы"
