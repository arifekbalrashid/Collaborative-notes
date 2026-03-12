"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path

from database import init_db
from routers import auth_router, document_router, ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize database on startup."""
    await init_db()
    print("Database initialized")
    print("Real-Time Collaborative Notes is running!")
    print("Open http://localhost:8000 in your browser")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Real-Time Collaborative Notes",
    description="A Google Docs-lite application for real-time document collaboration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(document_router.router)
app.include_router(ws_router.router)

# Serve frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")


# Frontend routes
@app.get("/")
async def serve_index():
    return FileResponse(str(frontend_path / "index.html"))


@app.get("/dashboard")
async def serve_dashboard():
    return FileResponse(str(frontend_path / "dashboard.html"))


@app.get("/editor/{doc_id}")
async def serve_editor(doc_id: int):
    return FileResponse(str(frontend_path / "editor.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
