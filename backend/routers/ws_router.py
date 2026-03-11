"""WebSocket router for real-time document collaboration."""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from database import get_db, async_session
from auth import decode_token
from services.collaboration import collab_manager
from services.document_service import save_document_content, check_user_has_access, get_user_permission

router = APIRouter(tags=["WebSocket"])

# Auto-save interval: save to DB every N edits
AUTO_SAVE_EDIT_COUNT = 10


@router.websocket("/ws/{document_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    document_id: int,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time document editing."""

    # Authenticate the WebSocket connection
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
        username = payload.get("username")
    except Exception:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    # Check document access and get permission level
    async with async_session() as db:
        has_access = await check_user_has_access(db, document_id, user_id)
        if not has_access:
            await websocket.close(code=4003, reason="Access denied")
            return
        permission = await get_user_permission(db, document_id, user_id)

    # Connect user to the collaboration session
    connected_user = await collab_manager.connect(document_id, user_id, username, websocket)

    # Send permission level to client so it can adjust the UI
    await websocket.send_json({
        "type": "permission",
        "permission": permission,  # "owner", "edit", or "view"
    })

    edit_count = 0
    last_content = None

    try:
        while True:
            # Receive message from client
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            msg_type = data.get("type")

            if msg_type == "edit":
                # Only allow edits from users with edit/owner permission
                if permission == "view":
                    await websocket.send_json({"type": "error", "message": "You have view-only access"})
                    continue

                # User edited the document content
                content = data.get("content", "")
                last_content = content
                edit_count += 1

                # Broadcast the edit to other users
                await collab_manager.broadcast(document_id, {
                    "type": "edit",
                    "content": content,
                    "user_id": user_id,
                    "username": username,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, exclude_user_id=user_id)

                # Auto-save to database periodically (NO version - just persist content)
                if edit_count >= AUTO_SAVE_EDIT_COUNT:
                    async with async_session() as db:
                        await save_document_content(db, document_id, content, user_id, save_version=False)
                    edit_count = 0

            elif msg_type == "cursor":
                # User moved their cursor / selection
                position = data.get("position", 0)
                selection_end = data.get("selection_end", position)
                cursor_color = data.get("color", "")
                await collab_manager.update_cursor(document_id, user_id, position)

                await collab_manager.broadcast(document_id, {
                    "type": "cursor",
                    "user_id": user_id,
                    "username": username,
                    "position": position,
                    "selection_end": selection_end,
                    "color": cursor_color,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, exclude_user_id=user_id)

            elif msg_type == "typing":
                # User is typing indicator
                await collab_manager.broadcast(document_id, {
                    "type": "typing",
                    "user_id": user_id,
                    "username": username,
                    "is_typing": data.get("is_typing", True),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, exclude_user_id=user_id)

            elif msg_type == "auto_save":
                if permission == "view":
                    continue
                # Silent auto-save - persist content without creating a version
                content = data.get("content", "")
                async with async_session() as db:
                    await save_document_content(db, document_id, content, user_id, save_version=False)
                edit_count = 0

                await websocket.send_json({
                    "type": "saved",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif msg_type == "save":
                if permission == "view":
                    continue
                # Explicit save request
                content = data.get("content", "")
                async with async_session() as db:
                    await save_document_content(db, document_id, content, user_id, save_version=False)
                edit_count = 0

                await websocket.send_json({
                    "type": "saved",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error for user {username}: {e}")
    finally:
        # Save any unsaved content on disconnect (no version - just persist)
        if last_content is not None and edit_count > 0:
            try:
                async with async_session() as db:
                    await save_document_content(db, document_id, last_content, user_id, save_version=False)
            except Exception:
                pass

        # Disconnect user from collaboration session
        await collab_manager.disconnect(document_id, user_id)
