"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path

from database import init_db
from routers import auth_router, document_router, ws_router
from config import PORT, ALLOWED_ORIGINS, MYSQL_SSL_CA


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize database on startup."""
    await init_db()
    print("Database initialized")
    if MYSQL_SSL_CA:
        print(f"SSL enabled — CA cert: {MYSQL_SSL_CA}")
    else:
        print("SSL disabled (no MYSQL_SSL_CA set)")
    print(f"Real-Time Collaborative Notes is running on port {PORT}!")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Real-Time Collaborative Notes",
    description="A Google Docs-lite application for real-time document collaboration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
origins = ["*"] if ALLOWED_ORIGINS == "*" else [o.strip() for o in ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(document_router.router)
app.include_router(ws_router.router)


# Health check for Render
@app.get("/health")
async def health_check():
    """Health check endpoint for Render."""
    from sqlalchemy import text
    from database import async_session
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}


# Serve frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")


# Frontend routes
@app.get("/")
async def serve_index():
    if (frontend_path / "index.html").exists():
        return FileResponse(str(frontend_path / "index.html"))
    return {"message": "API running"}


@app.get("/dashboard")
async def serve_dashboard():
    return FileResponse(str(frontend_path / "dashboard.html"))


@app.get("/editor/{doc_id}")
async def serve_editor(doc_id: int):
    return FileResponse(str(frontend_path / "editor.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)

