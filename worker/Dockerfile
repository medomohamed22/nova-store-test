FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV BLENDER_VERSION=5.2.2
ENV BLENDER_HOME=/opt/blender
ENV PATH="/opt/blender:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils python3 python3-pip python3-venv \
    libx11-6 libxext6 libxrender1 libxi6 libxfixes3 libxrandr2 libxinerama1 \
    libxcursor1 libxxf86vm1 libsm6 libice6 libegl1 libgl1 libglx0 \
    libwayland-client0 libwayland-egl1 libxkbcommon0 libdbus-1-3 \
    libfontconfig1 libfreetype6 libpulse0 libasound2t64 \
    libgl1-mesa-dri mesa-utils xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L "https://download.blender.org/release/Blender5.2/blender-${BLENDER_VERSION}-linux-x64.tar.xz" -o /tmp/blender.tar.xz \
    && mkdir -p /opt/blender-dist \
    && tar -xJf /tmp/blender.tar.xz -C /opt/blender-dist \
    && ln -s "/opt/blender-dist/blender-${BLENDER_VERSION}-linux-x64" /opt/blender \
    && rm /tmp/blender.tar.xz

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

COPY app.py driver.py ./

ENV PORT=8080
EXPOSE 8080

CMD ["python3", "app.py"]
