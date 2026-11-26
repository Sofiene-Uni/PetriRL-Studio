# PetriRL Studio: one container, CPU only. Build: docker compose build   Run: docker compose up -d
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_CONFIG=production \
    PETRIRL_DATA_DIR=/data

WORKDIR /app

# CPU build of PyTorch first (much smaller than the default CUDA build), then the rest
COPY requirements.txt .
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt gunicorn

COPY . .

# the app's data is NOT in the image: docker-compose mounts a folder of the server at /data
# files copied from a NAS share may be readable only by their owner: make the app readable for the "studio" user
RUN useradd --create-home --uid 1000 studio && chmod -R a+rX /app && chmod +x docker-entrypoint.sh
EXPOSE 5000
ENTRYPOINT ["./docker-entrypoint.sh"]

# one worker: the compute queue lives in this process; threads serve pages while a job computes
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "120", "--bind", "0.0.0.0:5000", "run:app"]
