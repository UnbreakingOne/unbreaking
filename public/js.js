(function () {
            const authOverlay = document.getElementById('authOverlay');
            const loginForm = document.getElementById('loginForm');
            const signupForm = document.getElementById('signupForm');
            const toggleAuthBtn = document.getElementById('toggleAuthBtn');
            const authTitle = document.getElementById('authTitle');
            const authMessage = document.getElementById('authMessage');
            const sspModalOverlay = document.getElementById('sspModalOverlay');
            const sspModalTitle = document.getElementById('sspModalTitle');
            const sspModalText = document.getElementById('sspModalText');
            const sspModalInput = document.getElementById('sspModalInput');
            const sspModalCancel = document.getElementById('sspModalCancel');
            const sspModalConfirm = document.getElementById('sspModalConfirm');
            const userMenuWrap = document.getElementById('userMenuWrap');
            const userMenuBtn = document.getElementById('userMenuBtn');
            const userDropdown = document.getElementById('userDropdown');
            const userLogoutBtn = document.getElementById('userLogoutBtn');
            const aiChatWidget = document.getElementById('aiChatWidget');
            const aiChatMessages = document.getElementById('aiChatMessages');
            const aiChatForm = document.getElementById('aiChatForm');
            const aiChatInput = document.getElementById('aiChatInput');
            const aiChatSend = document.getElementById('aiChatSend');
            const aiChatHideBtn = document.getElementById('aiChatHideBtn');

            const clock = document.getElementById('clock');
            const settingsMenu = document.getElementById('settingsMenu');
            const settingsIcon = document.getElementById('settingsIcon');
            const glowColorInput = document.getElementById('glowColor');
            const toggleFullscreen = document.getElementById('toggleFullscreen');
            const adminPanelBtn = document.getElementById('adminPanelBtn');
            const bgAudio = document.getElementById('bgAudio');

            const mainContent = document.getElementById('mainContent');
            const homeContent = document.getElementById('homeContent');
            const gamesContent = document.getElementById('gamesContent');
            const appsContent = document.getElementById('appsContent');
            const requestContent = document.getElementById('requestContent');
            const proxyContent = document.getElementById('proxyContent');
            const adminDashboard = document.getElementById('adminDashboard');
            const contentFrame = document.getElementById('contentFrame');
            const titleHeader = document.getElementById('titleHeader');
            const proxyIframe = document.getElementById('proxyIframe');
            const requestType = document.getElementById('requestType');
            const requestSubject = document.getElementById('requestSubject');
            const requestDetails = document.getElementById('requestDetails');
            const requestPageUrl = document.getElementById('requestPageUrl');
            const requestSubmitBtn = document.getElementById('requestSubmitBtn');
            const requestStatus = document.getElementById('requestStatus');
            const homeSearchForm = document.getElementById('homeSearchForm');
            const homeSearchInput = document.getElementById('homeSearchInput');
            const gamesLinksContainer = document.getElementById('gamesLinksContainer');
            const addGameBtn = document.getElementById('addGameBtn');
            const addGamePanel = document.getElementById('addGamePanel');
            const addGameForm = document.getElementById('addGameForm');
            const cancelAddGameBtn = document.getElementById('cancelAddGameBtn');
            const addGameType = document.getElementById('addGameType');
            const addGameName = document.getElementById('addGameName');
            const addGameUrl = document.getElementById('addGameUrl');
            const addGameHtml = document.getElementById('addGameHtml');
            const addGameIcon = document.getElementById('addGameIcon');
            const addGameUrlWrap = document.getElementById('addGameUrlWrap');
            const addGameHtmlWrap = document.getElementById('addGameHtmlWrap');
            const addGameSubmitBtn = addGameForm.querySelector('button[type="submit"]');

            let isLoginMode = true;
            let heartbeatInterval;
            let activeModalResolve = null;
            let adminUsersCache = [];
            let adminCustomGamesCache = [];
            let editingCustomGameId = '';
            const aiConversation = [];

            function updateGlowColorRgb() {
                const color = getComputedStyle(document.documentElement).getPropertyValue('--glow-color').trim();
                const hex = color.startsWith('#') ? color : '#9b59b6';
                let r = 0, g = 0, b = 0;
                if (hex.length === 7) {
                    r = parseInt(hex.slice(1, 3), 16);
                    g = parseInt(hex.slice(3, 5), 16);
                    b = parseInt(hex.slice(5, 7), 16);
                } else if (hex.length === 4) {
                    r = parseInt(hex[1] + hex[1], 16);
                    g = parseInt(hex[2] + hex[2], 16);
                    b = parseInt(hex[3] + hex[3], 16);
                }
                document.documentElement.style.setProperty('--glow-color-rgb-R', r);
                document.documentElement.style.setProperty('--glow-color-rgb-G', g);
                document.documentElement.style.setProperty('--glow-color-rgb-B', b);
            }
            updateGlowColorRgb();

            function openSiteModal({
                title = '',
                text = '',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                showInput = false,
                placeholder = '',
                dangerConfirm = false,
                dismissible = true
            }) {
                return new Promise((resolve) => {
                    sspModalTitle.innerText = title;
                    sspModalText.innerText = text;
                    sspModalConfirm.innerText = confirmText;
                    sspModalCancel.innerText = cancelText;
                    sspModalCancel.style.display = dismissible ? 'inline-block' : 'none';
                    sspModalConfirm.classList.toggle('danger', !!dangerConfirm);
                    sspModalInput.style.display = showInput ? 'block' : 'none';
                    sspModalInput.placeholder = placeholder;
                    sspModalInput.value = '';
                    sspModalOverlay.style.display = 'flex';

                    if (showInput) setTimeout(() => sspModalInput.focus(), 0);
                    else setTimeout(() => sspModalConfirm.focus(), 0);

                    function cleanup(result) {
                        sspModalOverlay.style.display = 'none';
                        sspModalConfirm.onclick = null;
                        sspModalCancel.onclick = null;
                        activeModalResolve = null;
                        resolve(result);
                    }

                    sspModalConfirm.onclick = () => cleanup({ confirmed: true, value: sspModalInput.value.trim() });
                    sspModalCancel.onclick = () => cleanup({ confirmed: false, value: '' });
                    activeModalResolve = cleanup;
                });
            }

            sspModalOverlay.addEventListener('click', (e) => {
                if (e.target === sspModalOverlay && activeModalResolve) {
                    activeModalResolve({ confirmed: false, value: '' });
                }
            });

            function getSavedUiSettings() {
                return { glow: true, clock: true, ai: true, musicOn: true, musicTrack: "", ...(JSON.parse(localStorage.getItem("sspSettings")) || {}) };
            }

            function shouldShowAiChat() {
                return Boolean(localStorage.getItem('token')) && getSavedUiSettings().ai !== false;
            }

            function updateAiChatVisibility() {
                aiChatWidget.style.display = shouldShowAiChat() ? 'flex' : 'none';
            }

            function checkLoginStatus() {
                const token = localStorage.getItem('token');
                const role = localStorage.getItem('role');
                const username = localStorage.getItem('username');

                if (token) {
                    authOverlay.style.display = 'none';
                    userMenuWrap.style.display = 'block';
                    userMenuBtn.innerText = username || 'Account';
                    adminPanelBtn.style.display = role === 'admin' ? 'block' : 'none';
                    updateAiChatVisibility();
                    startHeartbeat();
                    loadAllCustomGames();
                } else {
                    authOverlay.style.display = 'flex';
                    userMenuWrap.style.display = 'none';
                    userDropdown.style.display = 'none';
                    adminPanelBtn.style.display = 'none';
                    updateAiChatVisibility();
                    if (heartbeatInterval) clearInterval(heartbeatInterval);
                    clearRenderedCustomGames();
                }

                requestAnimationFrame(() => {
                    if (typeof fitSidebarToViewport === 'function') fitSidebarToViewport();
                });
            }
            checkLoginStatus();

            toggleAuthBtn.addEventListener('click', () => {
                isLoginMode = !isLoginMode;
                authMessage.innerText = "";
                authMessage.style.color = "#d580ff";
                if (isLoginMode) {
                    loginForm.style.display = 'block';
                    signupForm.style.display = 'none';
                    authTitle.innerText = 'Log In to Tempest';
                    toggleAuthBtn.innerText = 'Need an account? Sign Up';
                } else {
                    loginForm.style.display = 'none';
                    signupForm.style.display = 'block';
                    authTitle.innerText = 'Create Tempest Account';
                    toggleAuthBtn.innerText = 'Already have an account? Log In';
                }
            });

            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('loginUser').value;
                const password = document.getElementById('loginPass').value;
                authMessage.innerText = "Authenticating...";
                authMessage.style.color = "#d580ff";

                try {
                    const response = await fetch('/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await response.json();

                    if (data.token) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('role', data.role);
                        localStorage.setItem('username', data.username || username);
                        authMessage.innerText = "Access Granted.";
                        authMessage.style.color = "#28a745";
                        setTimeout(checkLoginStatus, 500);
                    } else {
                        if (data.banned) {
                            const reason = data.banReason || "No reason provided";
                            await openSiteModal({
                                title: "Account Banned",
                                text: `You are banned from SSP.\nReason: ${reason}`,
                                confirmText: "OK",
                                cancelText: "Close",
                                dismissible: true
                            });
                            authMessage.innerText = `Banned: ${reason}`;
                        } else {
                            authMessage.innerText = data.error;
                        }
                        authMessage.style.color = "#ff4d4d";
                    }
                } catch (_) {
                    authMessage.innerText = "Server error. Try again later.";
                    authMessage.style.color = "#ff4d4d";
                }
            });

            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('signupUser').value;
                const email = document.getElementById('signupEmail').value;
                const password = document.getElementById('signupPass').value;
                authMessage.innerText = "Registering...";
                authMessage.style.color = "#d580ff";

                try {
                    const response = await fetch('/signup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, email, password })
                    });
                    const data = await response.json();

                    if (response.ok) {
                        authMessage.innerText = data.message;
                        authMessage.style.color = "#28a745";
                        setTimeout(() => toggleAuthBtn.click(), 2500);
                    } else {
                        authMessage.innerText = data.error;
                        authMessage.style.color = "#ff4d4d";
                    }
                } catch (_) {
                    authMessage.innerText = "Server error. Try again later.";
                    authMessage.style.color = "#ff4d4d";
                }
            });

            function forceLogout(msg) {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('username');
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                hideAllSections();
                homeContent.style.display = "flex";
                checkLoginStatus();
                authMessage.innerText = msg;
                authMessage.style.color = "#ff4d4d";
            }

            userLogoutBtn.addEventListener('click', async () => {
                const token = localStorage.getItem('token');
                if (token) {
                    userLogoutBtn.innerText = "Logging out...";
                    try {
                        await fetch('/offline', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                    } catch (_) {}
                }
                forceLogout("Logged out securely.");
                authMessage.style.color = "#d580ff";
                userLogoutBtn.innerText = "Log Out";
            });

            async function loadAdminData() {
                const token = localStorage.getItem('token');
                try {
                    const response = await fetch('/admin/users', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    adminUsersCache = await response.json();
                    renderAdminTable();
                } catch (_) {
                    const tbody = document.getElementById('adminUserTableBody');
                    tbody.innerHTML = `<tr><td colspan="5">Could not load user data.</td></tr>`;
                }
            }

            function renderAdminTable() {
                const tbody = document.getElementById('adminUserTableBody');
                const searchText = (document.getElementById('adminSearchBar').value || '').toLowerCase().trim();
                tbody.innerHTML = '';

                adminUsersCache
                    .filter((user) => {
                        if (!searchText) return true;
                        const u = (user.username || '').toLowerCase();
                        const e = (user.email || '').toLowerCase();
                        return u.includes(searchText) || e.includes(searchText);
                    })
                    .forEach(user => {
                        const statusText = user.is_banned ? 'BANNED' : (user.is_approved ? 'Approved' : 'Pending');
                        const onlineBadge = user.is_online
                            ? `<span class="statusBadge online">Online</span>`
                            : `<span class="statusBadge offline">Offline</span>`;

                        let actionButtons = '';
                        if (!user.is_approved) actionButtons += `<button class="adminActionBtn btn-approve" onclick="adminAction(${user.id}, 'approve')">Approve</button>`;
                        if (!user.is_banned) actionButtons += `<button class="adminActionBtn btn-ban" onclick="adminAction(${user.id}, 'ban')">Ban</button>`;
                        if (user.is_banned) actionButtons += `<button class="adminActionBtn btn-unban" onclick="adminAction(${user.id}, 'unban')">Unban</button>`;

                        tbody.innerHTML += `
                            <tr>
                                <td>${user.username}</td>
                                <td>${user.email}</td>
                                <td>${statusText}</td>
                                <td>${onlineBadge}</td>
                                <td>${actionButtons}</td>
                            </tr>
                        `;
                    });
            }

            async function loadAdminRequests() {
                const token = localStorage.getItem('token');
                try {
                    const response = await fetch('/admin/requests', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const requests = await response.json();
                    const tbody = document.getElementById('adminRequestTableBody');
                    tbody.innerHTML = '';

                    requests.forEach((item) => {
                        const when = new Date(item.created_at).toLocaleString();
                        tbody.innerHTML += `
                            <tr>
                                <td>${when}</td>
                                <td>${item.username}</td>
                                <td>${item.request_type}</td>
                                <td>${item.subject}</td>
                                <td>${item.details}</td>
                                <td>${item.page_url || ''}</td>
                            </tr>
                        `;
                    });
                } catch (_) {
                    const tbody = document.getElementById('adminRequestTableBody');
                    tbody.innerHTML = `<tr><td colspan="6">Could not load request submissions.</td></tr>`;
                }
            }

            async function loadAdminCustomGames() {
                const token = localStorage.getItem('token');
                const tbody = document.getElementById('adminCustomGameTableBody');
                if (!tbody) return;

                try {
                    const response = await fetch('/admin/custom-games', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!response.ok) throw new Error('Could not load custom games.');
                    adminCustomGamesCache = await response.json();
                    renderAdminCustomGamesTable();
                } catch (_) {
                    tbody.innerHTML = `<tr><td colspan="7">Could not load custom games.</td></tr>`;
                }
            }

            function renderAdminCustomGamesTable() {
                const tbody = document.getElementById('adminCustomGameTableBody');
                if (!tbody) return;
                tbody.innerHTML = '';

                if (!adminCustomGamesCache.length) {
                    tbody.innerHTML = `<tr><td colspan="7">No custom games found.</td></tr>`;
                    return;
                }

                adminCustomGamesCache.forEach((game) => {
                    const status = game.is_published
                        ? `<span class="statusBadge online">Published</span>`
                        : `<span class="statusBadge offline">Private</span>`;
                    const target = game.game_type === 'html' ? 'HTML game' : escapeHtml(game.target_url || 'No URL');
                    const publishButton = game.is_published
                        ? `<button class="adminActionBtn btn-unpublish" onclick="adminCustomGameAction(${game.id}, 'unpublish')">Unpublish</button>`
                        : `<button class="adminActionBtn btn-approve" onclick="adminCustomGameAction(${game.id}, 'publish')">Publish</button>`;

                    tbody.innerHTML += `
                        <tr>
                            <td>${escapeHtml(game.name)}</td>
                            <td>${escapeHtml(game.username || 'Unknown User')}</td>
                            <td>${escapeHtml(game.game_type || '')}</td>
                            <td>${target}</td>
                            <td>${status}</td>
                            <td>${new Date(game.created_at).toLocaleString()}</td>
                            <td>${publishButton}<button class="adminActionBtn btn-ban" onclick="adminCustomGameAction(${game.id}, 'delete')">Delete</button></td>
                        </tr>
                    `;
                });
            }

            window.adminCustomGameAction = async function (gameId, action) {
                if (action === 'delete') {
                    const modalResult = await openSiteModal({
                        title: "Delete Custom Game",
                        text: "Delete this custom game from every account? This cannot be undone.",
                        confirmText: "Delete",
                        cancelText: "Cancel",
                        dangerConfirm: true
                    });
                    if (!modalResult.confirmed) return;
                }

                await performAdminCustomGameAction(gameId, action);
            };

            window.adminAction = async function (userId, action) {
                const token = localStorage.getItem('token');
                let reason = '';

                if (action === 'ban') {
                    const modalResult = await openSiteModal({
                        title: "Ban User",
                        text: "Type why this account is banned. This message will be shown when they try to log in.",
                        confirmText: "Ban User",
                        cancelText: "Cancel",
                        showInput: true,
                        placeholder: "Example: Harassment in chat",
                        dangerConfirm: true
                    });

                    if (!modalResult.confirmed) return;
                    reason = modalResult.value || "No reason provided";
                }

                try {
                    const response = await fetch('/admin/action', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ userId, action, reason })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        alert(`Error performing action: ${errorData.error || response.statusText}`);
                    }
                } catch (_) {
                    alert("Network error or server unavailable.");
                }
                loadAdminData();
            };

            async function sendHeartbeat() {
                const token = localStorage.getItem('token');
                if (!token) return;

                try {
                    const response = await fetch('/heartbeat', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (response.status === 401) {
                        forceLogout("Session expired. Please log in again.");
                    }
                } catch (_) {}
            }

            function startHeartbeat() {
                sendHeartbeat();
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(sendHeartbeat, 5000);
            }

            window.addEventListener('visibilitychange', () => {
                const token = localStorage.getItem('token');
                if (document.visibilityState === 'hidden' && token) {
                    navigator.sendBeacon(`/offline`, new Blob([JSON.stringify({ token })], { type: 'application/json' }));
                    fetch('/offline', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        keepalive: true
                    }).catch(() => {});
                }
            });

            function updateClock() {
                const now = new Date();
                let h = now.getHours();
                const m = String(now.getMinutes()).padStart(2, '0');
                const s = String(now.getSeconds()).padStart(2, '0');
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12;
                clock.textContent = `${h}:${m}:${s} ${ampm}`;
            }
            setInterval(updateClock, 1000);
            updateClock();

            function fitSidebarToViewport() {
                const sideNavBar = document.getElementById('sideNavBar');
                if (!sideNavBar) return;

                document.documentElement.style.setProperty('--sidebar-scale', '1');
                const viewportHeight = window.innerHeight;
                const targetHeight = sideNavBar.scrollHeight;
                const safeVerticalPadding = 24;
                const maxAllowedHeight = Math.max(200, viewportHeight - safeVerticalPadding);
                const scale = Math.min(1, maxAllowedHeight / targetHeight);
                document.documentElement.style.setProperty('--sidebar-scale', String(scale));
            }
            fitSidebarToViewport();
            window.addEventListener('resize', fitSidebarToViewport);


            function normalizeUrlInput(value) {
                const typed = (value || '').trim();
                if (!typed) return '';
                if (!/^https?:\/\//i.test(typed)) return `https://${typed}`;
                return typed;
            }

            function escapeHtml(unsafe) {
                return String(unsafe || '').replace(/[&<>\