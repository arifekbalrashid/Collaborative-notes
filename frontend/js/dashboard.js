/**
 * Dashboard Page Logic
 * Handles document listing, creation, sharing, and deletion.
 */

let currentDocuments = [];
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    if (!api.isAuthenticated()) {
        window.location.href = '/';
        return;
    }
    initDashboard();
});

async function initDashboard() {
    setupNavbar();
    setupModals();
    setupSearch();
    await loadDocuments();
}

function setupNavbar() {
    const user = api.getUser();
    if (user) {
        document.getElementById('user-display-name').textContent = user.username;
        document.getElementById('user-avatar-letter').textContent = user.username[0].toUpperCase();
    }
    document.getElementById('logout-btn').addEventListener('click', () => {
        api.logout();
    });
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim();
            renderDocuments();
        });
    }

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchQuery = '';
            renderDocuments();
            searchInput.focus();
        });
    }
}

function setupModals() {
    // Create document modal
    const createBtn = document.getElementById('create-doc-btn');
    const createModal = document.getElementById('create-modal');
    const closeCreateModal = document.getElementById('close-create-modal');
    const createForm = document.getElementById('create-doc-form');

    createBtn.addEventListener('click', () => {
        createModal.classList.add('active');
        document.getElementById('doc-title-input').focus();
    });

    closeCreateModal.addEventListener('click', () => {
        createModal.classList.remove('active');
    });

    createModal.addEventListener('click', (e) => {
        if (e.target === createModal) createModal.classList.remove('active');
    });

    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('doc-title-input').value.trim();
        if (!title) return;

        try {
            const doc = await api.createDocument(title);
            createModal.classList.remove('active');
            document.getElementById('doc-title-input').value = '';
            showToast('Document created!', 'success');
            window.location.href = `/editor/${doc.id}`;
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Share modal
    const shareModal = document.getElementById('share-modal');
    const closeShareModal = document.getElementById('close-share-modal');

    closeShareModal.addEventListener('click', () => {
        shareModal.classList.remove('active');
    });

    shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) shareModal.classList.remove('active');
    });

    document.getElementById('share-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = document.getElementById('share-doc-id').value;
        const username = document.getElementById('share-username-input').value.trim();

        if (!username) return;

        try {
            await api.shareDocument(docId, username);
            showToast(`Document shared with ${username}!`, 'success');
            document.getElementById('share-username-input').value = '';
            await loadDocuments();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

async function loadDocuments() {
    try {
        currentDocuments = await api.getDocuments();
        renderDocuments();
        updateStats();
    } catch (error) {
        showToast('Failed to load documents', 'error');
    }
}

function renderDocuments() {
    const query = searchQuery.toLowerCase();
    const filteredDocs = query
        ? currentDocuments.filter(d => d.title.toLowerCase().includes(query))
        : currentDocuments;

    const ownedDocs = filteredDocs.filter(d => !d.is_shared);
    const sharedDocs = filteredDocs.filter(d => d.is_shared);

    // Render my documents
    const myDocsGrid = document.getElementById('my-docs-grid');
    if (ownedDocs.length === 0) {
        myDocsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">📄</div>
                <h3>No documents yet</h3>
                <p>Create your first collaborative document to get started.</p>
                <button class="btn btn-primary" onclick="document.getElementById('create-doc-btn').click()">
                    Create Document
                </button>
            </div>
        `;
    } else {
        myDocsGrid.innerHTML = ownedDocs.map(doc => createDocCard(doc, true)).join('');
    }

    // Render shared documents
    const sharedDocsSection = document.getElementById('shared-docs-section');
    const sharedDocsGrid = document.getElementById('shared-docs-grid');

    if (sharedDocs.length > 0) {
        sharedDocsSection.style.display = 'block';
        sharedDocsGrid.innerHTML = sharedDocs.map(doc => createDocCard(doc, false)).join('');
    } else {
        sharedDocsSection.style.display = 'none';
    }
}

function createDocCard(doc, isOwner) {
    const date = new Date(doc.updated_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
    const time = new Date(doc.updated_at).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit',
    });

    const permBadge = !isOwner
        ? `<span class="permission-badge ${doc.my_permission}">${doc.my_permission === 'edit' ? 'Can Edit' : 'View Only'}</span>`
        : '';

    return `
        <div class="doc-card" onclick="openDocument(${doc.id})" id="doc-card-${doc.id}">
            <div class="doc-card-header">
                <span class="doc-card-title">${escapeHtml(doc.title)}</span>
                <span class="doc-card-badge ${isOwner ? 'owned' : ''}">${isOwner ? 'Owner' : 'Shared'}${permBadge}</span>
            </div>
            <div class="doc-card-meta">
                <span>${isOwner ? 'By you' : 'By ' + escapeHtml(doc.owner_username)}</span>
                <span class="dot"></span>
                <span>${date} at ${time}</span>
            </div>
            <div class="doc-card-actions" onclick="event.stopPropagation()">
                ${isOwner ? `
                    <button class="btn btn-secondary btn-sm" onclick="openShareModal(${doc.id}, '${escapeHtml(doc.title)}')">
                        Share
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDocument(${doc.id})">
                        Delete
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

function updateStats() {
    const ownedDocs = currentDocuments.filter(d => !d.is_shared);
    const sharedDocs = currentDocuments.filter(d => d.is_shared);

    document.getElementById('stat-total').textContent = currentDocuments.length;
    document.getElementById('stat-owned').textContent = ownedDocs.length;
    document.getElementById('stat-shared').textContent = sharedDocs.length;
}

function openDocument(docId) {
    window.location.href = `/editor/${docId}`;
}

function openShareModal(docId, title) {
    document.getElementById('share-doc-id').value = docId;
    document.getElementById('share-doc-title').textContent = title;
    document.getElementById('share-modal').classList.add('active');
    document.getElementById('share-username-input').focus();
}

async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) {
        return;
    }

    try {
        await api.deleteDocument(docId);
        showToast('Document deleted', 'success');
        await loadDocuments();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
