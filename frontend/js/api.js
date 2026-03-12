/**
 * API Client Utilities
 * Handles all HTTP requests and authentication token management.
 */

const API_BASE = '';

const api = {
    /**
     * Get stored auth token
     */
    getToken() {
        return localStorage.getItem('auth_token');
    },

    /**
     * Store auth token
     */
    setToken(token) {
        localStorage.setItem('auth_token', token);
    },

    /**
     * Remove auth token (logout)
     */
    removeToken() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
    },

    /**
     * Get stored user data
     */
    getUser() {
        const data = localStorage.getItem('user_data');
        return data ? JSON.parse(data) : null;
    },

    /**
     * Store user data
     */
    setUser(user) {
        localStorage.setItem('user_data', JSON.stringify(user));
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.getToken();
    },

    /**
     * Make an authenticated API request
     */
    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            if (response.status === 401) {
                this.removeToken();
                window.location.href = '/';
                return null;
            }

            if (response.status === 204) {
                return { success: true };
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Request failed');
            }

            return data;
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                throw new Error('Network error. Please check your connection.');
            }
            throw error;
        }
    },

    // ── Auth Endpoints ──────────────────────────────────

    async register(username, email, password) {
        const data = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });
        if (data?.access_token) {
            this.setToken(data.access_token);
            await this.fetchCurrentUser();
        }
        return data;
    },

    async login(username, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        if (data?.access_token) {
            this.setToken(data.access_token);
            await this.fetchCurrentUser();
        }
        return data;
    },

    async fetchCurrentUser() {
        const user = await this.request('/api/auth/me');
        if (user) {
            this.setUser(user);
        }
        return user;
    },

    logout() {
        this.removeToken();
        window.location.href = '/';
    },

    // ── Document Endpoints ──────────────────────────────

    async createDocument(title) {
        return this.request('/api/documents/', {
            method: 'POST',
            body: JSON.stringify({ title }),
        });
    },

    async getDocuments() {
        return this.request('/api/documents/');
    },

    async getDocument(id) {
        return this.request(`/api/documents/${id}`);
    },

    async updateDocument(id, data) {
        return this.request(`/api/documents/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteDocument(id) {
        return this.request(`/api/documents/${id}`, {
            method: 'DELETE',
        });
    },

    // ── Sharing Endpoints ───────────────────────────────

    async shareDocument(docId, username, permission = 'edit') {
        return this.request(`/api/documents/${docId}/share`, {
            method: 'POST',
            body: JSON.stringify({ username, permission }),
        });
    },

    async unshareDocument(docId, username) {
        return this.request(`/api/documents/${docId}/share/${username}`, {
            method: 'DELETE',
        });
    },

    // ── Version Endpoints ───────────────────────────────

    async getVersions(docId) {
        return this.request(`/api/documents/${docId}/versions`);
    },

    // ── WebSocket ───────────────────────────────────────

    getWebSocketUrl(documentId) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = this.getToken();
        return `${protocol}//${window.location.host}/ws/${documentId}?token=${token}`;
    },
};
