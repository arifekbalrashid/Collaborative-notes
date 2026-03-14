"""Application configuration."""

import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

# Load .env file for local development
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_env_path)
except ImportError:
    pass


# JWT Settings
SECRET_KEY = os.getenv("SECRET_KEY", "abc123xyz")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# Server
PORT = int(os.getenv("PORT", "8000"))

# Database — MySQL via aiomysql async driver
_raw_db_url = os.getenv(
    "DATABASE_URL",
    "mysql+aiomysql://root:password@localhost:3306/collaborative_notes",
)

parsed = urlparse(_raw_db_url)

# Convert mysql:// → mysql+aiomysql:// (required for async driver)
if parsed.scheme == "mysql":
    parsed = parsed._replace(scheme="mysql+aiomysql")

# Remove query params like ?ssl-mode=REQUIRED
DATABASE_URL = urlunparse(parsed._replace(query=""))

# SSL certificate content (from Render env variable)
MYSQL_SSL_CA = os.getenv("MYSQL_SSL_CA", "")

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")