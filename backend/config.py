"""Application configuration."""

import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

# Load .env file for local development (harmless on Render where env vars are injected)
try:
    from dotenv import load_dotenv
    # Look for .env in the project root (one level up from backend/)
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_env_path)
except ImportError:
    pass  # python-dotenv not installed — rely on real env vars

# JWT Settings
SECRET_KEY = os.getenv("SECRET_KEY", "abc123xyz")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Server
PORT = int(os.getenv("PORT", "8000"))

# Database — MySQL via aiomysql async driver
# Aiven gives you:  mysql://user:password@host:port/dbname?ssl-mode=REQUIRED
# SQLAlchemy needs:  mysql+aiomysql://user:password@host:port/dbname
_raw_db_url = os.getenv(
    "DATABASE_URL",
    "mysql+aiomysql://root:password@localhost:3306/collaborative_notes",
)

# Auto-convert Aiven's "mysql://" scheme to "mysql+aiomysql://"
parsed = urlparse(_raw_db_url)
if parsed.scheme == "mysql":
    parsed = parsed._replace(scheme="mysql+aiomysql")

# Strip query params (like ?ssl-mode=REQUIRED) because we handle SSL via connect_args
DATABASE_URL = urlunparse(parsed._replace(query=""))

# SSL — Aiven requires TLS connections
# Set MYSQL_SSL_CA to the path of the CA certificate file (ca.pem)
# On Render, the build.sh script writes it to /etc/ssl/certs/aiven-ca.pem
MYSQL_SSL_CA = os.getenv("MYSQL_SSL_CA", "")

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
