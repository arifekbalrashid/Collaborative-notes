"""Document service - business logic for document operations."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy import desc
from models import Document, DocumentVersion, DocumentShare, User
from datetime import datetime, timezone, timedelta

# Minimum time between version snapshots (in seconds)
VERSION_MIN_INTERVAL = 120  # 2 minutes


async def save_document_content(
    db: AsyncSession,
    document_id: int,
    content: str,
    user_id: int,
    save_version: bool = True,
):
    """Save document content and optionally create a version snapshot."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()

    if not doc:
        return None

    # Only save version if explicitly requested, content changed, and enough time passed
    if save_version and doc.content != content:
        # Check time since last version to avoid flooding history
        should_save_version = True
        last_version = await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(desc(DocumentVersion.created_at))
            .limit(1)
        )
        last_ver = last_version.scalar_one_or_none()
        if last_ver:
            elapsed = (datetime.now(timezone.utc) - last_ver.created_at.replace(tzinfo=timezone.utc)).total_seconds()
            if elapsed < VERSION_MIN_INTERVAL:
                should_save_version = False

        if should_save_version:
            version = DocumentVersion(
                document_id=document_id,
                content=doc.content,  # Save the OLD content as a version
                edited_by=user_id,
            )
            db.add(version)

    doc.content = content
    doc.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(doc)
    return doc


async def check_user_has_access(db: AsyncSession, document_id: int, user_id: int) -> bool:
    """Check if a user has access to a document (owner or shared)."""
    # Check if owner
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.owner_id == user_id)
    )
    if result.scalar_one_or_none():
        return True

    # Check if shared
    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def get_user_permission(db: AsyncSession, document_id: int, user_id: int) -> str:
    """Get the user's permission level for a document: 'owner', 'edit', or 'view'."""
    # Check if owner
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.owner_id == user_id)
    )
    if result.scalar_one_or_none():
        return "owner"

    # Check share permission
    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == document_id,
            DocumentShare.user_id == user_id,
        )
    )
    share = result.scalar_one_or_none()
    if share:
        return share.permission  # "edit" or "view"

    return "none"


async def get_document_by_id(db: AsyncSession, document_id: int):
    """Get a document by ID."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    return result.scalar_one_or_none()
