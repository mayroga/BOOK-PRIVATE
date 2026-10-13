
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"
APP_NAME = "LIBRETA PRIVADA — MAY ROGA LLC"
APP_VERSION = "1.0.2"

app = FastAPI(
    title=APP_NAME,
    description="Libreta digital personal que almacena las anotaciones en el dispositivo del usuario.",
    version=APP_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

allowed_hosts = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "").split(",")
    if host.strip()
]
if allowed_hosts:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=allowed_hosts
    )

if STATIC_DIR.is_dir():
    app.mount(
        "/static",
        StaticFiles(directory=str(STATIC_DIR), check_dir=True),
        name="static"
    )

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=()"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'self'"
    )
    response.headers["Cache-Control"] = "no-store"
    return response

@app.get("/", include_in_schema=False)
async def home():
    if not INDEX_FILE.is_file():
        return JSONResponse(
            {"error": "No se encontró el archivo static/index.html."},
            status_code=500
        )
    return FileResponse(
        INDEX_FILE,
        media_type="text/html",
        headers={"Cache-Control": "no-store"}
    )

@app.get("/health", include_in_schema=False)
async def health():
    return {
        "status": "ok",
        "app": "LIBRETA PRIVADA",
        "version": APP_VERSION
    }
