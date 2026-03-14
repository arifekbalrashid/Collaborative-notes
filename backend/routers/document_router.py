"""Document router - CRUD and sharing endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, desc
from sqlalchemy.orm import selectinload
from typing import List
from backend.database import get_db
from backend.models import User, Document, DocumentShare, DocumentVersion
from backend.schemas import (
    DocumentCreate, DocumentUpdate, DocumentResponse,
    DocumentListItem, ShareDocument, ShareResponse, SharedUserInfo,
    VersionResponse,
)
from backend.auth import get_current_user

router = APIRouter(prefix="/api/documents", tags=["Documents"])


async def check_document_access(doc_id: int, user: User, db: AsyncSession, require_owner: bool = False, require_edit: bool = False):
    """Check if user has access to a document. Returns (doc, permission)."""
    result = await db.execute(
        select(Document).options(selectinload(Document.shares).selectinload(DocumentShare.user))
        .where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id == user.id:
        return doc, "owner"

    if require_owner:
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")

    # Check if shared with user
    share_result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == doc_id,
            DocumentShare.user_id == user.id,
        )
    )
    share = share_result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=403, detail="You don't have access to this document")

    permission = share.permission  # "edit" or "view"

    if require_edit and permission != "edit":
        raise HTTPException(status_code=403, detail="You only have view permission on this document")

    return doc, permission


@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    doc_data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new document."""
    doc = Document(title=doc_data.title, owner_id=current_user.id)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        content=doc.content,
        owner_id=doc.owner_id,
        owner_username=current_user.username,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        shared_with=[],
    )


@router.get("/", response_model=List[DocumentListItem])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents the user owns or has access to."""
    # Get owned documents
    owned_result = await db.execute(
        select(Document).where(Document.owner_id == current_user.id)
        .order_by(Document.updated_at.desc())
    )
    owned_docs = owned_result.scalars().all()

    # Get shared documents
    shared_result = await db.execute(
        select(Document)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .where(DocumentShare.user_id == current_user.id)
        .order_by(Document.updated_at.desc())
    )
    shared_docs = shared_result.scalars().all()

    items = []
    for doc in owned_docs:
        items.append(DocumentListItem(
            id=doc.id,
            title=doc.title,
            owner_id=doc.owner_id,
            owner_username=current_user.username,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            is_shared=False,
        ))

    for doc in shared_docs:
        # Get owner username and permission
        owner_result = await db.execute(select(User).where(User.id == doc.owner_id))
        owner = owner_result.scalar_one_or_none()
        share_result = await db.execute(
            select(DocumentShare).where(
                DocumentShare.document_id == doc.id,
                DocumentShare.user_id == current_user.id,
            )
        )
        share = share_result.scalar_one_or_none()
        items.append(DocumentListItem(
            id=doc.id,
            title=doc.title,
            owner_id=doc.owner_id,
            owner_username=owner.username if owner else "Unknown",
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            is_shared=True,
            my_permission=share.permission if share else "view",
        ))

    return items


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific document."""
    doc, my_permission = await check_document_access(doc_id, current_user, db)

    # Get owner username
    owner_result = await db.execute(select(User).where(User.id == doc.owner_id))
    owner = owner_result.scalar_one_or_none()

    # Get shared users with their permissions
    shares_result = await db.execute(
        select(DocumentShare).options(selectinload(DocumentShare.user))
        .where(DocumentShare.document_id == doc_id)
    )
    shares = shares_result.scalars().all()
    shared_with = [SharedUserInfo(username=s.user.username, permission=s.permission) for s in shares if s.user]

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        content=doc.content,
        owner_id=doc.owner_id,
        owner_username=owner.username if owner else "Unknown",
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        shared_with=shared_with,
        my_permission=my_permission,
    )


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int,
    doc_data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a document (title or content)."""
    doc, my_permission = await check_document_access(doc_id, current_user, db, require_edit=True)

    if doc_data.title is not None:
        doc.title = doc_data.title
    if doc_data.content is not None:
        doc.content = doc_data.content

    await db.commit()
    await db.refresh(doc)

    owner_result = await db.execute(select(User).where(User.id == doc.owner_id))
    owner = owner_result.scalar_one_or_none()

    return DocumentResponse(
        id=doc.id,
        title=doc.title,
        content=doc.content,
        owner_id=doc.owner_id,
        owner_username=owner.username if owner else "Unknown",
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        shared_with=[],
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document (owner only)."""
    doc, _ = await check_document_access(doc_id, current_user, db, require_owner=True)
    await db.delete(doc)
    await db.commit()


@router.post("/{doc_id}/share", response_model=ShareResponse)
async def share_document(
    doc_id: int,
    share_data: ShareDocument,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Share a document with another user."""
    doc, _ = await check_document_access(doc_id, current_user, db, require_owner=True)

    # Find user to share with
    result = await db.execute(select(User).where(User.username == share_data.username))
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{share_data.username}' not found")

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share document with yourself")

    # Check if already shared
    existing = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == doc_id,
            DocumentShare.user_id == target_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Document already shared with this user")

    share = DocumentShare(
        document_id=doc_id,
        user_id=target_user.id,
        permission=share_data.permission,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return ShareResponse(
        id=share.id,
        document_id=share.document_id,
        user_id=share.user_id,
        username=target_user.username,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.delete("/{doc_id}/share/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_document(
    doc_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove sharing for a user."""
    await check_document_access(doc_id, current_user, db, require_owner=True)  # unpacks as tuple, we only need it to not throw

    result = await db.execute(select(User).where(User.username == username))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    share_result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == doc_id,
            DocumentShare.user_id == target_user.id,
        )
    )
    share = share_result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    await db.delete(share)
    await db.commit()


@router.get("/{doc_id}/versions", response_model=List[VersionResponse])
async def get_versions(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get version history for a document."""
    # Check access (any level is fine — view or edit)
    await check_document_access(doc_id, current_user, db)

    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc_id)
        .order_by(desc(DocumentVersion.created_at))
        .limit(50)
    )
    versions = result.scalars().all()

    items = []
    for v in versions:
        # Get editor username
        editor_result = await db.execute(select(User).where(User.id == v.edited_by))
        editor = editor_result.scalar_one_or_none()
        items.append(VersionResponse(
            id=v.id,
            document_id=v.document_id,
            content=v.content,
            edited_by=v.edited_by,
            editor_username=editor.username if editor else "Unknown",
            created_at=v.created_at,
        ))

    return items

