"""Database setup and session management."""

import ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import DATABASE_URL, MYSQL_SSL_CA


def _build_connect_args() -> dict:
    """Build connect_args with SSL context when an Aiven CA cert is configured."""
    if not MYSQL_SSL_CA:
        return {}

    ctx = ssl.create_default_context(cafile=MYSQL_SSL_CA)
    # Aiven certs are self-signed CAs — verify against the provided CA only
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_REQUIRED
    return {"ssl": ctx}


engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_recycle=3600,      # Recycle connections after 1 hour
    pool_pre_ping=True,     # Test connections before using them (avoids "MySQL has gone away")
    pool_size=5,            # Keep a small pool (Aiven free tier limits connections)
    max_overflow=5,         # Allow up to 10 total connections
    connect_args=_build_connect_args(),
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
