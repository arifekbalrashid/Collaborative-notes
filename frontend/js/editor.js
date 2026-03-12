/**
 * Editor Page Logic
 * Real-time collaborative document editing with WebSocket support.
 */

let ws = null;
let currentDoc = null;
let typingTimeout = null;
let autoSaveTimeout = null;
let isRemoteUpdate = false;
let myPermission = 'owner'; // will be set by server
const TYPING_DELAY = 1000;
const AUTO_SAVE_DELAY = 5000;

// ── User Presence Cursors ──────────────────────────────
const remoteCursors = new Map(); // username -> { position, selectionEnd, color }
const CURSOR_COLORS = [
    '#f06050', '#00d4c8', '#f0c246', '#4da6ff', '#ff6bcc',
    '#42e695', '#ff9f43', '#a29bfe', '#fd79a8', '#00cec9',
];
let cursorColorIndex = 0;

function getMyCursorColor() {
    return localStorage.getItem('cursor_color') || '#7c6cf0';
}

function setMyCursorColor(color) {
    localStorage.setItem('cursor_color', color);
    // Immediately broadcast new color
    broadcastCursorPosition();
}

function getColorForUser(username) {
    // If we have a stored color from the server for this user, use it
    if (remoteCursors.has(username) && remoteCursors.get(username).color) {
        return remoteCursors.get(username).color;
    }
    // Otherwise assign from palette
    const color = CURSOR_COLORS[cursorColorIndex % CURSOR_COLORS.length];
    cursorColorIndex++;
    return color;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!api.isAuthenticated()) { window.location.href = '/'; return; }
    initEditor();
});

async function initEditor() {
    setupNavbar();
    const docId = getDocumentId();
    if (!docId) { window.location.href = '/dashboard'; return; }
    try {
        currentDoc = await api.getDocument(docId);
        document.getElementById('editor-doc-title').value = currentDoc.title;
        document.getElementById('editor-area').value = currentDoc.content || '';
        document.title = `${currentDoc.title} - Collaborative Notes`;
        connectWebSocket(docId);
        setupEditorEvents();

        // Apply initial permission from API response
        if (currentDoc.my_permission) {
            applyPermission(currentDoc.my_permission);
        }
    } catch (error) {
        showToast('Failed to load document', 'error');
        setTimeout(() => window.location.href = '/dashboard', 2000);
    }
}

function getDocumentId() {
    const parts = window.location.pathname.split('/');
    return parts[parts.length - 1];
}

function setupNavbar() {
    const user = api.getUser();
    if (user) {
        document.getElementById('user-display-name').textContent = user.username;
        document.getElementById('user-avatar-letter').textContent = user.username[0].toUpperCase();
    }
    document.getElementById('logout-btn')?.addEventListener('click', () => api.logout());
    document.getElementById('back-btn')?.addEventListener('click', () => window.location.href = '/dashboard');
}

// ── WebSocket Connection ───────────────────────────────

function connectWebSocket(docId) {
    const wsUrl = api.getWebSocketUrl(docId);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        updateConnectionStatus('connected');
        showToast('Connected to live editing', 'success');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
    };

    ws.onclose = () => {
        updateConnectionStatus('disconnected');
        setTimeout(() => {
            if (currentDoc) connectWebSocket(docId);
        }, 3000);
    };

    ws.onerror = () => updateConnectionStatus('error');
}

function handleWSMessage(data) {
    switch (data.type) {
        case 'edit':
            handleRemoteEdit(data);
            break;
        case 'user_joined':
            showToast(`${data.username} joined`, 'info');
            updateActiveUsers(data.active_users);
            break;
        case 'user_left':
            showToast(`${data.username} left`, 'info');
            updateActiveUsers(data.active_users);
            break;
        case 'sync_users':
            updateActiveUsers(data.active_users);
            break;
        case 'typing':
            handleTypingIndicator(data);
            break;
        case 'cursor':
            handleRemoteCursor(data);
            break;
        case 'saved':
            updateSaveStatus('saved');
            break;
        case 'permission':
            applyPermission(data.permission);
            break;
        case 'error':
            showToast(data.message, 'error');
            break;
    }
}

function handleRemoteEdit(data) {
    const editor = document.getElementById('editor-area');
    const cursorPos = editor.selectionStart;
    const scrollPos = editor.scrollTop;

    isRemoteUpdate = true;
    editor.value = data.content;
    isRemoteUpdate = false;

    editor.selectionStart = cursorPos;
    editor.selectionEnd = cursorPos;
    editor.scrollTop = scrollPos;
}

// ── Editor Events ──────────────────────────────────────

function setupEditorEvents() {
    const editor = document.getElementById('editor-area');
    const titleInput = document.getElementById('editor-doc-title');

    editor.addEventListener('input', () => {
        if (isRemoteUpdate) return;
        const content = editor.value;
        // Send edit via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'edit', content }));
            ws.send(JSON.stringify({ type: 'typing', is_typing: true }));
        }
        updateSaveStatus('unsaved');
        // Auto-save after delay (silent - no version history)
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => autoSaveDocument(), AUTO_SAVE_DELAY);
        // Typing indicator timeout
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'typing', is_typing: false }));
            }
        }, TYPING_DELAY);
    });

    // Broadcast cursor position on click, select, and key navigation
    editor.addEventListener('click', broadcastCursorPosition);
    editor.addEventListener('select', broadcastCursorPosition);
    editor.addEventListener('mouseup', broadcastCursorPosition);
    editor.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key) ||
            (e.shiftKey)) {
            broadcastCursorPosition();
        }
    });

    editor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveDocument();
        }
        // Tab support
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
            editor.dispatchEvent(new Event('input'));
        }
    });

    titleInput.addEventListener('change', async () => {
        const newTitle = titleInput.value.trim();
        if (newTitle && newTitle !== currentDoc.title) {
            try {
                await api.updateDocument(currentDoc.id, { title: newTitle });
                currentDoc.title = newTitle;
                document.title = `${newTitle} - Collaborative Notes`;
                showToast('Title updated', 'success');
            } catch (error) {
                showToast('Failed to update title', 'error');
            }
        }
    });

    // Save btn
    document.getElementById('save-btn')?.addEventListener('click', () => saveDocument());
    // Share btn
    document.getElementById('share-btn')?.addEventListener('click', () => openShareModal());
    // Export PDF btn
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => exportToPDF());

    // Cursor color picker
    const colorPicker = document.getElementById('cursor-color-picker');
    if (colorPicker) {
        colorPicker.value = getMyCursorColor();
        colorPicker.addEventListener('input', (e) => {
            setMyCursorColor(e.target.value);
            // Update the color swatch
            const swatch = document.getElementById('cursor-color-swatch');
            if (swatch) swatch.style.background = e.target.value;
        });
    }
    // Set initial swatch color
    const swatch = document.getElementById('cursor-color-swatch');
    if (swatch) swatch.style.background = getMyCursorColor();

    // Init cursor overlay
    initCursorOverlay();
}

async function saveDocument() {
    if (!currentDoc) return;
    const content = document.getElementById('editor-area').value;
    updateSaveStatus('saving');
    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'save', content }));
        } else {
            await api.updateDocument(currentDoc.id, { content });
        }
        updateSaveStatus('saved');
    } catch {
        updateSaveStatus('error');
    }
}

// Silent auto-save - just persists content, no version history
async function autoSaveDocument() {
    if (!currentDoc) return;
    const content = document.getElementById('editor-area').value;
    updateSaveStatus('saving');
    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'auto_save', content }));
        } else {
            await api.updateDocument(currentDoc.id, { content });
        }
        updateSaveStatus('saved');
    } catch {
        updateSaveStatus('error');
    }
}

function updateSaveStatus(status) {
    const dot = document.querySelector('.save-status .dot');
    const text = document.querySelector('.save-status .status-text');
    if (!dot || !text) return;
    dot.className = 'dot';
    switch (status) {
        case 'saved': text.textContent = 'Saved'; dot.classList.add('saved'); break;
        case 'saving': text.textContent = 'Saving...'; dot.classList.add('saving'); break;
        case 'unsaved': text.textContent = 'Unsaved changes'; dot.classList.add('saving'); break;
        case 'error': text.textContent = 'Save failed'; break;
    }
}

function updateConnectionStatus(status) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    switch (status) {
        case 'connected': el.innerHTML = '<span class="dot"></span> Connected'; break;
        case 'disconnected': el.innerHTML = '<span class="dot saving"></span> Reconnecting...'; break;
        case 'error': el.innerHTML = '<span class="dot" style="background:var(--accent-danger)"></span> Error'; break;
    }
}
// ── Permission Management ──────────────────────────────

function applyPermission(permission) {
    myPermission = permission;
    const editor = document.getElementById('editor-area');
    const saveBtn = document.getElementById('save-btn');
    const shareBtn = document.getElementById('share-btn');
    const titleInput = document.getElementById('editor-doc-title');

    if (permission === 'view') {
        // Make editor read-only
        editor.readOnly = true;
        editor.style.opacity = '0.85';
        editor.style.cursor = 'default';
        editor.placeholder = 'You have view-only access to this document.';

        // Disable save button
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.5';
            saveBtn.title = 'View-only access';
        }

        // Disable title editing
        if (titleInput) {
            titleInput.readOnly = true;
            titleInput.style.opacity = '0.7';
        }

        // Hide share button (only owners can share)
        if (shareBtn) shareBtn.style.display = 'none';

        // Show read-only badge
        const toolbar = document.querySelector('.editor-toolbar');
        if (toolbar && !document.getElementById('readonly-badge')) {
            const badge = document.createElement('span');
            badge.id = 'readonly-badge';
            badge.className = 'permission-badge view';
            badge.innerHTML = '👁️ View Only';
            toolbar.querySelector('div')?.appendChild(badge);
        }

        showToast('You have view-only access', 'info');
    } else {
        // Editable
        editor.readOnly = false;
        editor.style.opacity = '1';
        editor.style.cursor = '';

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
        }

        // Show share button only for owner
        if (shareBtn) {
            shareBtn.style.display = (permission === 'owner') ? '' : 'none';
        }

        // Show permission badge for collaborators
        const toolbar = document.querySelector('.editor-toolbar');
        if (toolbar && permission === 'edit' && !document.getElementById('readonly-badge')) {
            const badge = document.createElement('span');
            badge.id = 'readonly-badge';
            badge.className = 'permission-badge edit';
            badge.innerHTML = 'Can Edit';
            toolbar.querySelector('div')?.appendChild(badge);
        }
    }
}

// ── Active Users ───────────────────────────────────────

function updateActiveUsers(users) {
    const list = document.getElementById('active-users-list');
    if (!list || !users) return;
    list.innerHTML = users.map(u => `
        <div class="active-user-chip">
            <span class="user-dot"></span>
            ${escapeHtml(u.username)}
        </div>
    `).join('');

    // Clean up cursors for users who left
    for (const [username] of remoteCursors) {
        if (!users.find(u => u.username === username)) {
            remoteCursors.delete(username);
            const el = document.getElementById(`cursor-${CSS.escape(username)}`);
            if (el) el.remove();
        }
    }
}

// ── Typing Indicators ──────────────────────────────────

const typingUsers = new Map();

function handleTypingIndicator(data) {
    const container = document.getElementById('typing-indicators');
    if (!container) return;
    if (data.is_typing) {
        typingUsers.set(data.username, Date.now());
    } else {
        typingUsers.delete(data.username);
    }
    renderTypingIndicators();
    // Auto-clear after 3s
    setTimeout(() => {
        const ts = typingUsers.get(data.username);
        if (ts && Date.now() - ts > 2500) {
            typingUsers.delete(data.username);
            renderTypingIndicators();
        }
    }, 3000);
}

function renderTypingIndicators() {
    const container = document.getElementById('typing-indicators');
    if (!container) return;
    if (typingUsers.size === 0) { container.innerHTML = ''; return; }
    container.innerHTML = Array.from(typingUsers.keys()).map(u => `
        <div class="typing-indicator">
            <span>${escapeHtml(u)} is typing</span>
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
    `).join('');
}

// ── Share Modal ────────────────────────────────────────

function openShareModal() {
    const shareModal = document.getElementById('share-modal');
    if (!shareModal || !currentDoc) return;
    document.getElementById('share-doc-title').textContent = currentDoc.title;
    if (currentDoc.shared_with && currentDoc.shared_with.length > 0) {
        const list = document.getElementById('shared-users-list');
        list.innerHTML = currentDoc.shared_with.map(u => `
            <div class="share-user-item">
                <div class="share-user-info">
                    <div class="share-user-avatar">${u.username[0].toUpperCase()}</div>
                    <span>${escapeHtml(u.username)}</span>
                    <span class="permission-badge ${u.permission}">${u.permission === 'edit' ? 'Can Edit' : '👁️ View Only'}</span>
                </div>
                <button class="btn btn-danger btn-sm" onclick="removeShare('${u.username}')">Remove</button>
            </div>
        `).join('');
    } else {
        document.getElementById('shared-users-list').innerHTML = '<p class="text-secondary" style="text-align:center; padding: 12px;">Not shared with anyone yet</p>';
    }
    shareModal.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('close-share-modal')?.addEventListener('click', () => {
        document.getElementById('share-modal').classList.remove('active');
    });
    document.getElementById('share-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'share-modal') e.target.classList.remove('active');
    });
    document.getElementById('share-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('share-username-input').value.trim();
        const permission = document.getElementById('share-permission-select').value;
        if (!username || !currentDoc) return;
        try {
            await api.shareDocument(currentDoc.id, username, permission);
            showToast(`Shared with ${username} (${permission === 'edit' ? 'can edit' : 'view only'})`, 'success');
            document.getElementById('share-username-input').value = '';
            currentDoc = await api.getDocument(currentDoc.id);
            openShareModal();
        } catch (error) { showToast(error.message, 'error'); }
    });
});

async function removeShare(username) {
    if (!currentDoc) return;
    try {
        await api.unshareDocument(currentDoc.id, username);
        showToast(`Removed ${username}`, 'success');
        currentDoc = await api.getDocument(currentDoc.id);
        openShareModal();
    } catch (error) { showToast(error.message, 'error'); }
}

// ── Utilities ──────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clean up on page leave
window.addEventListener('beforeunload', () => {
    if (ws) ws.close();
    if (autoSaveTimeout) { clearTimeout(autoSaveTimeout); saveDocument(); }
});

// ── Cursor Broadcasting ───────────────────────────────

function broadcastCursorPosition() {
    const editor = document.getElementById('editor-area');
    if (!editor || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'cursor',
        position: editor.selectionStart,
        selection_end: editor.selectionEnd,
        color: getMyCursorColor(),
    }));
}

// ── Remote Cursor Rendering ───────────────────────────

function initCursorOverlay() {
    const editorContainer = document.querySelector('.editor-container');
    if (!editorContainer) return;

    // Create cursor overlay container
    let overlay = document.getElementById('cursor-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'cursor-overlay';
        overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;';
        editorContainer.style.position = 'relative';
        editorContainer.appendChild(overlay);
    }

    // Create hidden mirror div for position calculation
    let mirror = document.getElementById('cursor-mirror');
    if (!mirror) {
        mirror = document.createElement('div');
        mirror.id = 'cursor-mirror';
        mirror.style.cssText = `
            position:absolute;top:0;left:0;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;
            overflow-wrap:break-word;pointer-events:none;z-index:-1;
        `;
        editorContainer.appendChild(mirror);
    }

    // Reposition cursors on scroll
    const editor = document.getElementById('editor-area');
    editor?.addEventListener('scroll', () => {
        for (const [username] of remoteCursors) {
            renderCursorOverlay(username);
        }
    });
}

function handleRemoteCursor(data) {
    if (!data.username || data.position === undefined) return;
    const myUser = api.getUser();
    if (myUser && data.username === myUser.username) return; // ignore own cursor

    const color = data.color || getColorForUser(data.username);
    const selectionEnd = data.selection_end !== undefined ? data.selection_end : data.position;
    remoteCursors.set(data.username, { position: data.position, selectionEnd, color });
    renderCursorOverlay(data.username);
}

function getPositionCoords(mirror, editor, charPos) {
    // Get pixel coordinates for a character position in the editor
    const text = editor.value.substring(0, charPos);
    mirror.textContent = text;
    const marker = document.createElement('span');
    marker.textContent = '\u200b'; // zero-width space
    mirror.appendChild(marker);
    const markerRect = marker.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    mirror.removeChild(marker);
    return {
        x: markerRect.left - editorRect.left,
        y: markerRect.top - editorRect.top,
    };
}

function renderCursorOverlay(username) {
    const overlay = document.getElementById('cursor-overlay');
    const editor = document.getElementById('editor-area');
    const mirror = document.getElementById('cursor-mirror');
    if (!overlay || !editor || !mirror) return;

    const cursorData = remoteCursors.get(username);
    if (!cursorData) return;

    // Sync mirror styles with editor
    const editorStyle = getComputedStyle(editor);
    mirror.style.fontFamily = editorStyle.fontFamily;
    mirror.style.fontSize = editorStyle.fontSize;
    mirror.style.lineHeight = editorStyle.lineHeight;
    mirror.style.letterSpacing = editorStyle.letterSpacing;
    mirror.style.padding = editorStyle.padding;
    mirror.style.width = editor.clientWidth + 'px';
    mirror.style.tabSize = editorStyle.tabSize;

    const cursorId = `cursor-${username.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const selectionId = `selection-${username.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Calculate cursor position
    const cursorCoords = getPositionCoords(mirror, editor, cursorData.position);

    // Get or create cursor element
    let cursorEl = document.getElementById(cursorId);
    if (!cursorEl) {
        cursorEl = document.createElement('div');
        cursorEl.id = cursorId;
        cursorEl.className = 'remote-cursor';
        overlay.appendChild(cursorEl);
    }
    cursorEl.innerHTML = `
        <div class="remote-cursor-line" style="background:${cursorData.color};"></div>
        <div class="remote-cursor-label" style="background:${cursorData.color};">${escapeHtml(username)}</div>
    `;

    // Position the cursor
    cursorEl.style.cssText = `position:absolute; left:${cursorCoords.x}px; top:${cursorCoords.y}px; transition: all 0.15s ease;`;
    cursorEl.style.opacity = (cursorCoords.y < 0 || cursorCoords.y > editor.clientHeight) ? '0' : '1';

    // Handle selection highlighting
    let selContainer = document.getElementById(selectionId);
    if (!selContainer) {
        selContainer = document.createElement('div');
        selContainer.id = selectionId;
        selContainer.className = 'remote-selection-container';
        overlay.appendChild(selContainer);
    }

    // Clear previous selection rects
    selContainer.innerHTML = '';

    const hasSelection = cursorData.selectionEnd !== cursorData.position;
    if (hasSelection) {
        const start = Math.min(cursorData.position, cursorData.selectionEnd);
        const end = Math.max(cursorData.position, cursorData.selectionEnd);
        const selectedText = editor.value.substring(start, end);

        // Split selection into lines and render each line's highlight
        const lines = selectedText.split('\n');
        let charOffset = start;

        for (let i = 0; i < lines.length; i++) {
            const lineStart = charOffset;
            const lineEnd = charOffset + lines[i].length;

            if (lines[i].length > 0) {
                const startCoords = getPositionCoords(mirror, editor, lineStart);
                const endCoords = getPositionCoords(mirror, editor, lineEnd);

                const rect = document.createElement('div');
                rect.className = 'remote-selection-rect';
                rect.style.cssText = `
                    position: absolute;
                    left: ${startCoords.x}px;
                    top: ${startCoords.y}px;
                    width: ${Math.max(endCoords.x - startCoords.x, 4)}px;
                    height: ${parseFloat(editorStyle.lineHeight) || 20}px;
                    background: ${cursorData.color};
                    opacity: 0.2;
                    border-radius: 2px;
                    pointer-events: none;
                    transition: all 0.1s ease;
                `;
                selContainer.appendChild(rect);
            }

            charOffset = lineEnd + 1; // +1 for the newline
        }
    }
}

// ── Export to PDF ──────────────────────────────────────

function exportToPDF() {
    if (!currentDoc) return;
    const content = document.getElementById('editor-area').value;
    const title = document.getElementById('editor-doc-title').value || 'Untitled Document';
    const user = api.getUser();
    const now = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>${escapeHtml(title)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1a1a2e;
            padding: 60px 72px;
            line-height: 1.7;
            background: #fff;
        }
        .pdf-header {
            border-bottom: 3px solid #7c6cf0;
            padding-bottom: 24px;
            margin-bottom: 36px;
        }
        .pdf-title {
            font-size: 28px;
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 8px;
        }
        .pdf-meta {
            font-size: 12px;
            color: #6c6c85;
            display: flex;
            gap: 24px;
        }
        .pdf-content {
            font-family: 'JetBrains Mono', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.8;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: #2d2d44;
            background: #f8f8fc;
            padding: 28px;
            border-radius: 12px;
            border: 1px solid #e8e8f0;
        }
        .pdf-footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #e8e8f0;
            font-size: 11px;
            color: #9a9ab8;
            text-align: center;
        }
        @media print {
            body { padding: 40px 48px; }
            .pdf-content { background: #fff; border: 1px solid #ddd; }
        }
    </style>
</head>
<body>
    <div class="pdf-header">
        <div class="pdf-title">${escapeHtml(title)}</div>
        <div class="pdf-meta">
            <span>Author: ${user ? escapeHtml(user.username) : 'Unknown'}</span>
            <span>Exported: ${now}</span>
            <span>Collaborative Notes</span>
        </div>
    </div>
    <div class="pdf-content">${escapeHtml(content) || '(Empty document)'}</div>
    <div class="pdf-footer">
        Exported from Collaborative Notes &mdash; Real-time collaborative document editing
    </div>
</body>
</html>`);
    printWindow.document.close();

    // Wait for fonts to load then trigger print
    setTimeout(() => {
        printWindow.print();
    }, 800);

    showToast('PDF export ready — use "Save as PDF" in print dialog', 'info');
}

