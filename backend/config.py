"""Application configuration."""

import os

# JWT Settings
SECRET_KEY = os.getenv("SECRET_KEY", "abc123xyz")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./collaborative_notes.db")

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
