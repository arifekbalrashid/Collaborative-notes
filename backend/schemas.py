"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


# Auth Schemas

class UserRegister(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Document Schemas

class DocumentCreate(BaseModel):
    title: str = "Untitled Document"


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class SharedUserInfo(BaseModel):
    username: str
    permission: str


class DocumentResponse(BaseModel):
    id: int
    title: str
    content: str
    owner_id: int
    owner_username: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    shared_with: Optional[List[SharedUserInfo]] = []
    my_permission: str = "owner"  # "owner", "edit", or "view"

    class Config:
        from_attributes = True


class DocumentListItem(BaseModel):
    id: int
    title: str
    owner_id: int
    owner_username: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_shared: bool = False
    my_permission: str = "owner"  # "owner", "edit", or "view"

    class Config:
        from_attributes = True


# Share Schemas

class ShareDocument(BaseModel):
    username: str
    permission: str = "edit"


class ShareResponse(BaseModel):
    id: int
    document_id: int
    user_id: int
    username: str
    permission: str
    created_at: datetime

    class Config:
        from_attributes = True


# Version Schemas

class VersionResponse(BaseModel):
    id: int
    document_id: int
    content: str
    edited_by: int
    editor_username: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# WebSocket Schemas

class WSMessage(BaseModel):
    type: str  # "edit", "cursor", "join", "leave", "sync"
    content: Optional[str] = None
    cursor_position: Optional[int] = None
    username: Optional[str] = None