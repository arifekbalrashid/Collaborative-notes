"""Database setup and session management."""

import ssl
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from backend.config import DATABASE_URL, MYSQL_SSL_CA


def _build_connect_args() -> dict:
    if not MYSQL_SSL_CA: 
        return {}

    cert_path = Path("/tmp/aiven-ca.pem")

    if not cert_path.exists() and MYSQL_SSL_CA:
        cert_path.write_text(MYSQL_SSL_CA)

    ctx = ssl.create_default_context(cafile=str(cert_path))
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_REQUIRED

    return {"ssl": ctx}


engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_recycle=3600,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    connect_args=_build_connect_args() | {"connect_timeout": 10}
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)