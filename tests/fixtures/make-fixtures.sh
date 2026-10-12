#!/bin/sh
# Генерирует тестовые медиафайлы с помощью образа воркера (FFmpeg, libvips уже внутри).
# Файлы складываются в tests/fixtures/generated и в репозиторий не попадают.
set -eu
cd "$(dirname "$0")"
mkdir -p generated
IMAGE="${IMAGE:-ain-cloud-worker}"
# В Git Bash на Windows Docker нужен путь вида C:/…, и MSYS не должен его переписывать
HOST_DIR="$(pwd -W 2>/dev/null || pwd)/generated"
export MSYS_NO_PATHCONV=1
DURATION="${DURATION:-12}"
docker run --rm --user root -v "$HOST_DIR:/out" --entrypoint sh "$IMAGE" -c "
  set -e
  # 4K UHD 3840×2160, 30 fps, со звуком — настоящий H.264-файл, а не заглушка
  [ -f /out/uhd-4k.mp4 ] || ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i testsrc2=size=3840x2160:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 \
    -t $DURATION -c:v libx264 -preset ultrafast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart /out/uhd-4k.mp4
  # Фото 6000×4000 с EXIF
  [ -f /out/photo.jpg ] || { ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=6000x4000 -frames:v 1 -q:v 3 /out/photo.jpg \
    && exiftool -q -overwrite_original -Make=AIN -Model=TestCam -ISO=200 -ExposureTime=0.004 -FNumber=2.8 \
       -DateTimeOriginal='2026:09:01 10:20:30' -GPSLatitude=51.128 -GPSLatitudeRef=N -GPSLongitude=71.430 -GPSLongitudeRef=E /out/photo.jpg; }
  # Демо-ролик для главной: 4K, плавный градиент в фирменных цветах и мягкий аккорд
  [ -f /out/ain-demo-4k.mp4 ] || ffmpeg -hide_banner -loglevel error -y     -f lavfi -i 'gradients=s=3840x2160:r=30:d=16:speed=0.015:n=5:c0=0x061a33:c1=0x1667c7:c2=0x2ef2a3:c3=0x7cc4ff:c4=0x0a0e13:seed=7'     -f lavfi -i \"aevalsrc='0.05*sin(2*PI*220*t)+0.04*sin(2*PI*277.18*t)+0.04*sin(2*PI*329.63*t)':s=48000:d=16\"     -filter_complex '[0:v]noise=alls=3:allf=t,format=yuv420p,fade=t=in:st=0:d=1,fade=t=out:st=15:d=1[v];[1:a]afade=t=in:d=1.5,afade=t=out:st=14:d=2[a]'     -map '[v]' -map '[a]' -c:v libx264 -preset slow -crf 20 -c:a aac -b:a 160k -movflags +faststart /out/ain-demo-4k.mp4
  # Текст под видом видео — должен быть заблокирован по несоответствию типа
  printf 'это не видео, а текст' > /out/fake-video.mp4
  chmod a+r /out/*
"
ls -la generated
