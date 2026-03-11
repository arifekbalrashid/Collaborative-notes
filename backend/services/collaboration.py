"""Real-time collaboration manager - manages WebSocket connections and broadcasts."""

import json
import asyncio
from typing import Dict, List, Set
from datetime import datetime, timezone
from dataclasses import dataclass, field
from fastapi import WebSocket


@dataclass
class ConnectedUser:
    """Represents a user connected to a document."""
    user_id: int
    username: str
    websocket: WebSocket
    cursor_position: int = 0
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class CollaborationManager:
    """Manages real-time document collaboration sessions."""

    def __init__(self):
        # document_id -> list of connected users
        self._sessions: Dict[int, List[ConnectedUser]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, document_id: int, user_id: int, username: str, websocket: WebSocket):
        """Add a user to a document session."""
        await websocket.accept()

        connected_user = ConnectedUser(
            user_id=user_id,
            username=username,
            websocket=websocket,
        )

        async with self._lock:
            if document_id not in self._sessions:
                self._sessions[document_id] = []

            # Remove existing connection for same user (reconnection)
            self._sessions[document_id] = [
                u for u in self._sessions[document_id] if u.user_id != user_id
            ]

            self._sessions[document_id].append(connected_user)

        # Notify others that user joined
        await self.broadcast(document_id, {
            "type": "user_joined",
            "username": username,
            "user_id": user_id,
            "active_users": await self.get_active_users(document_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, exclude_user_id=user_id)

        # Send current active users to the joining user
        await websocket.send_json({
            "type": "sync_users",
            "active_users": await self.get_active_users(document_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        return connected_user

    async def disconnect(self, document_id: int, user_id: int):
        """Remove a user from a document session."""
        username = None

        async with self._lock:
            if document_id in self._sessions:
                for user in self._sessions[document_id]:
                    if user.user_id == user_id:
                        username = user.username
                        break

                self._sessions[document_id] = [
                    u for u in self._sessions[document_id] if u.user_id != user_id
                ]

                if not self._sessions[document_id]:
                    del self._sessions[document_id]

        if username:
            await self.broadcast(document_id, {
                "type": "user_left",
                "username": username,
                "user_id": user_id,
                "active_users": await self.get_active_users(document_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    async def broadcast(self, document_id: int, message: dict, exclude_user_id: int = None):
        """Broadcast a message to all users in a document session."""
        if document_id not in self._sessions:
            return

        disconnected = []
        for user in self._sessions[document_id]:
            if exclude_user_id and user.user_id == exclude_user_id:
                continue
            try:
                await user.websocket.send_json(message)
            except Exception:
                disconnected.append(user.user_id)

        # Clean up disconnected users
        for uid in disconnected:
            await self.disconnect(document_id, uid)

    async def get_active_users(self, document_id: int) -> List[dict]:
        """Get list of active users in a document session."""
        if document_id not in self._sessions:
            return []

        return [
            {
                "user_id": u.user_id,
                "username": u.username,
                "cursor_position": u.cursor_position,
            }
            for u in self._sessions[document_id]
        ]

    async def update_cursor(self, document_id: int, user_id: int, position: int):
        """Update a user's cursor position."""
        if document_id in self._sessions:
            for user in self._sessions[document_id]:
                if user.user_id == user_id:
                    user.cursor_position = position
                    break

    def get_session_count(self) -> int:
        """Get total number of active sessions."""
        return len(self._sessions)

    def get_user_count(self, document_id: int) -> int:
        """Get number of users in a document session."""
        return len(self._sessions.get(document_id, []))


# Global collaboration manager instance
collab_manager = CollaborationManager()
