/**
 * Authentication Page Logic
 * Handles login and registration forms with tab switching.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already authenticated
    if (api.isAuthenticated()) {
        window.location.href = '/dashboard';
        return;
    }

    initTabs();
    initForms();
});

function initTabs() {
    const tabs = document.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.tab;
            if (target === 'login') {
                loginForm.style.display = 'flex';
                registerForm.style.display = 'none';
            } else {
                loginForm.style.display = 'none';
                registerForm.style.display = 'flex';
            }

            hideError();
        });
    });
}

function initForms() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner"></div> Signing in...';
            hideError();

            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;

            if (!username || !password) {
                showError('Please fill in all fields');
                return;
            }

            await api.login(username, password);
            window.location.href = '/dashboard';
        } catch (error) {
            showError(error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner"></div> Creating account...';
            hideError();

            const username = document.getElementById('register-username').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (!username || !email || !password || !confirmPassword) {
                showError('Please fill in all fields');
                return;
            }

            if (password !== confirmPassword) {
                showError('Passwords do not match');
                return;
            }

            if (password.length < 6) {
                showError('Password must be at least 6 characters');
                return;
            }

            await api.register(username, email, password);
            window.location.href = '/dashboard';
        } catch (error) {
            showError(error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.classList.add('visible');
}

function hideError() {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.classList.remove('visible');
}
