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
                return String(unsafe || '').replace(/[&<>"']/g, (ch) => {
                    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
                    return map[ch] || ch;
                });
            }

            function isCurrentUserAdmin() {
                return localStorage.getItem('role') === 'admin';
            }

            function databaseIdFromCustomId(customId) {
                const match = String(customId || '').match(/^cg-(\d+)$/);
                return match ? Number(match[1]) : 0;
            }

            function createCustomGameCard(game, options = {}) {
                const cardOptions = typeof options === 'boolean' ? { owned: options } : options;
                const isOwned = Boolean(cardOptions.owned);
                const isPublishedCard = Boolean(cardOptions.publishedCard);
                const card = document.createElement('div');
                card.className = 'gameCard';
                card.dataset.customGame = '1';
                if (isOwned) card.dataset.ownedCustomGame = '1';
                if (isPublishedCard) card.dataset.publicCustomGame = '1';
                if (game.customId) card.dataset.customGameId = game.customId;
                card.dataset.customGamePayload = JSON.stringify(game);
                card.innerHTML = `<img src="${escapeHtml(game.icon || '/images/games.png')}" alt="${escapeHtml(game.name)}"><div class="gameTitle">${escapeHtml(game.name)}</div>`;
                card.addEventListener('click', () => {
                    if (game.type === 'html') {
                        window.loadGameHtml(game.html || '');
                    } else {
                        window.loadGame(`/search/${encodeURIComponent(game.url || '')}`);
                    }
                });

                const actions = document.createElement('div');
                actions.className = 'customCardActions';

                if (isOwned) {
                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'customCardBtn';
                    editBtn.textContent = 'Edit';
                    editBtn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        openCustomGameEditor(card);
                    });
                    actions.appendChild(editBtn);
                }

                if (isCurrentUserAdmin()) {
                    const gameId = databaseIdFromCustomId(game.customId);
                    if (gameId) {
                        const publishBtn = document.createElement('button');
                        publishBtn.type = 'button';
                        publishBtn.className = 'customCardBtn';
                        publishBtn.textContent = game.published ? 'Unpublish' : 'Publish';
                        publishBtn.addEventListener('click', async (event) => {
                            event.stopPropagation();
                            await performAdminCustomGameAction(gameId, game.published ? 'unpublish' : 'publish');
                        });
                        actions.appendChild(publishBtn);
                    }
                }

                const canDeleteAsAdmin = isCurrentUserAdmin() && databaseIdFromCustomId(game.customId);
                if (isOwned || canDeleteAsAdmin) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'customCardBtn customCardBtnDanger';
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.addEventListener('click', async (event) => {
                        event.stopPropagation();

                        if (canDeleteAsAdmin) {
                            const modalResult = await openSiteModal({
                                title: "Delete Custom Game",
                                text: "Delete this custom game from every account? This cannot be undone.",
                                confirmText: "Delete",
                                cancelText: "Cancel",
                                dangerConfirm: true
                            });
                            if (!modalResult.confirmed) return;
                            await performAdminCustomGameAction(databaseIdFromCustomId(game.customId), 'delete');
                            return;
                        }

                        card.remove();
                        if (editingCustomGameId && card.dataset.customGameId === editingCustomGameId) {
                            resetAddGameForm();
                        }
                        await syncCustomGamesToUser();
                    });
                    actions.appendChild(deleteBtn);
                }

                if (actions.children.length) card.appendChild(actions);

                if (isOwned) {
                    gamesLinksContainer.prepend(card);
                } else {
                    gamesLinksContainer.appendChild(card);
                }
                return card;
            }

            function clearRenderedCustomGames() {
                const rendered = gamesLinksContainer.querySelectorAll('[data-custom-game="1"]');
                rendered.forEach((card) => card.remove());
            }

            function getCustomGamesFromDom() {
                const games = [];
                const rendered = gamesLinksContainer.querySelectorAll('[data-owned-custom-game="1"]');
                rendered.forEach((card) => {
                    const payload = card.dataset.customGamePayload;
                    if (!payload) return;
                    try {
                        games.push(JSON.parse(payload));
                    } catch (_) {}
                });
                return games;
            }

            async function syncCustomGamesToUser() {
                const customGames = getCustomGamesFromDom();
                const saved = await saveCustomGamesForUser(customGames);
                if (!saved) {
                    alert('Could not save custom games to your account right now.');
                    return;
                }
                await loadAllCustomGames();
                if (isCurrentUserAdmin() && adminDashboard.style.display === 'block') {
                    loadAdminCustomGames();
                }
            }

            function openCustomGameEditor(card) {
                const payload = card.dataset.customGamePayload;
                if (!payload) return;
                let game = null;
                try {
                    game = JSON.parse(payload);
                } catch (_) {
                    return;
                }
                editingCustomGameId = card.dataset.customGameId || '';
                addGamePanel.style.display = 'block';
                addGameName.value = game.name || '';
                addGameType.value = game.type === 'html' ? 'html' : 'url';
                addGameType.dispatchEvent(new Event('change'));
                addGameUrl.value = game.url || '';
                addGameHtml.value = game.html || '';
                addGameIcon.value = '';
                if (addGameSubmitBtn) addGameSubmitBtn.textContent = 'Update Game';
                addGameName.focus();
            }

            async function saveCustomGamesForUser(games) {
                const token = localStorage.getItem('token');
                if (!token) return false;
                try {
                    const response = await fetch('/custom-games', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ games })
                    });
                    return response.ok;
                } catch (_) {
                    return false;
                }
            }

            async function performAdminCustomGameAction(gameId, action) {
                const token = localStorage.getItem('token');
                if (!token || !isCurrentUserAdmin()) return;

                try {
                    const response = await fetch('/admin/custom-games/action', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ gameId, action })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        alert(data.error || 'Could not update custom game.');
                        return;
                    }
                    await loadAllCustomGames();
                    if (adminDashboard.style.display === 'block') loadAdminCustomGames();
                } catch (_) {
                    alert('Network error or server unavailable.');
                }
            }

            async function loadPublicCustomGames(existingIds = new Set()) {
                try {
                    const response = await fetch('/public-games');
                    if (!response.ok) return;
                    const data = await response.json();
                    const games = Array.isArray(data.games) ? data.games : [];
                    games.forEach((game) => {
                        if (!game.customId || existingIds.has(game.customId)) return;
                        createCustomGameCard(game, { publishedCard: true });
                        existingIds.add(game.customId);
                    });
                } catch (_) {}
            }

            async function loadCustomGamesForUser(existingIds = new Set()) {
                const token = localStorage.getItem('token');
                if (!token) return;
                try {
                    const response = await fetch('/custom-games', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!response.ok) return;
                    const data = await response.json();
                    const customGames = Array.isArray(data.games) ? data.games : [];
                    customGames.forEach((game) => {
                        if (!game.customId) game.customId = `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                        const duplicatePublicCard = gamesLinksContainer.querySelector(`[data-public-custom-game="1"][data-custom-game-id="${game.customId}"]`);
                        if (duplicatePublicCard) duplicatePublicCard.remove();
                        createCustomGameCard(game, { owned: true });
                        existingIds.add(game.customId);
                    });
                } catch (_) {}
            }

            async function loadAllCustomGames() {
                clearRenderedCustomGames();
                const existingIds = new Set();
                await loadPublicCustomGames(existingIds);
                await loadCustomGamesForUser(existingIds);
            }

            function resetAddGameForm() {
                addGameForm.reset();
                addGameType.value = 'url';
                addGameUrlWrap.style.display = 'block';
                addGameHtmlWrap.style.display = 'none';
                editingCustomGameId = '';
                if (addGameSubmitBtn) addGameSubmitBtn.textContent = 'Save Game';
            }

            addGameType.addEventListener('change', () => {
                const useHtml = addGameType.value === 'html';
                addGameUrlWrap.style.display = useHtml ? 'none' : 'block';
                addGameHtmlWrap.style.display = useHtml ? 'block' : 'none';
            });

            addGameBtn.addEventListener('click', () => {
                addGamePanel.style.display = 'block';
                addGameName.focus();
            });

            cancelAddGameBtn.addEventListener('click', () => {
                addGamePanel.style.display = 'none';
                resetAddGameForm();
            });

            addGameForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const type = addGameType.value;
                const name = addGameName.value.trim();

                if (!name) {
                    alert('Please type a game name.');
                    return;
                }

                let iconDataUrl = '/images/games.png';
                const iconFile = addGameIcon.files && addGameIcon.files[0];
                if (iconFile) {
                    iconDataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error('Could not read image file.'));
                        reader.readAsDataURL(iconFile);
                    }).catch(() => '/images/games.png');
                }

                const game = { name, type, icon: iconDataUrl };
                if (type === 'html') {
                    const html = addGameHtml.value.trim();
                    if (!html) {
                        alert('Please paste HTML code.');
                        return;
                    }
                    game.html = html;
                } else {
                    const url = normalizeUrlInput(addGameUrl.value);
                    if (!url) {
                        alert('Please type a URL.');
                        return;
                    }
                    game.url = url;
                }

                if (editingCustomGameId) {
                    const existingCard = gamesLinksContainer.querySelector(`[data-owned-custom-game="1"][data-custom-game-id="${editingCustomGameId}"]`);
                    game.customId = editingCustomGameId;
                    if (existingCard) {
                        try {
                            const previousGame = JSON.parse(existingCard.dataset.customGamePayload || '{}');
                            game.published = Boolean(previousGame.published);
                        } catch (_) {}
                        const image = existingCard.querySelector('img');
                        const title = existingCard.querySelector('.gameTitle');
                        if (image) {
                            image.src = game.icon || '/images/games.png';
                            image.alt = game.name;
                        }
                        if (title) title.textContent = game.name;
                        existingCard.dataset.customGamePayload = JSON.stringify(game);
                    }
                } else {
                    game.customId = `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                    const card = createCustomGameCard(game, true);
                    card.dataset.customGameId = game.customId;
                    card.dataset.customGamePayload = JSON.stringify(game);
                }

                await syncCustomGamesToUser();
                addGamePanel.style.display = 'none';
                resetAddGameForm();
            });

            function clearEmbeddedFrameActive() {
                mainContent.classList.remove('embedded-frame-active');
                contentFrame.classList.remove('is-frame-active');
                proxyIframe.classList.remove('is-frame-active');
                proxyContent.classList.remove('proxy-frame-active');
            }

            function activateEmbeddedFrame(frame) {
                mainContent.classList.toggle('embedded-frame-active', frame === contentFrame);
                contentFrame.classList.toggle('is-frame-active', frame === contentFrame);
                proxyIframe.classList.toggle('is-frame-active', frame === proxyIframe);
                proxyContent.classList.toggle('proxy-frame-active', frame === proxyIframe);
            }

            function hideAllSections() {
                clearEmbeddedFrameActive();
                homeContent.style.display = "none";
                gamesContent.style.display = "none";
                appsContent.style.display = "none";
                requestContent.style.display = "none";
                proxyContent.style.display = "none";
                adminDashboard.style.display = "none";
                contentFrame.style.display = "block";
                contentFrame.srcdoc = '';
                proxyIframe.src = "about:blank";
            }

            function normalizeEmbeddedRoute(url) {
                if (typeof url !== 'string') return url;
                if (/^(https?:)?\/\//i.test(url)) return url;
                if (!url.startsWith('/')) return url;
                if (/\.[a-z0-9]+([?#].*)?$/i.test(url)) return url;

                const [pathPart, suffix = ''] = url.split(/(?=[?#])/);
                if (pathPart.startsWith('/game/') || pathPart.startsWith('/app/')) {
                    return `${pathPart}.html${suffix}`;
                }

                return url;
            }

            window.loadGame = function (url) {
                hideAllSections();
                activateEmbeddedFrame(contentFrame);
                contentFrame.style.display = "block";
                contentFrame.removeAttribute('srcdoc');
                contentFrame.src = normalizeEmbeddedRoute(url);
            };

            window.loadGameHtml = function (htmlCode) {
                hideAllSections();
                activateEmbeddedFrame(contentFrame);
                contentFrame.style.display = "block";
                contentFrame.src = 'about:blank';
                contentFrame.srcdoc = htmlCode;
            };

            window.showGames = function () {
                hideAllSections();
                gamesContent.style.display = "block";
                contentFrame.src = "";
            };

            window.showApps = function () {
                hideAllSections();
                appsContent.style.display = "block";
                contentFrame.src = "";
            };

            window.showRequest = function () {
                hideAllSections();
                requestContent.style.display = "block";
            };

            window.showProxy = function () {
                hideAllSections();
                activateEmbeddedFrame(proxyIframe);
                proxyContent.style.display = "block";
                proxyIframe.src = "/p";
            };

            window.showAdmin = function () {
                hideAllSections();
                adminDashboard.style.display = "block";
                settingsMenu.style.display = "none";
                loadAdminData();
                loadAdminRequests();
                loadAdminCustomGames();
            };

            document.getElementById('adminSearchBar').addEventListener('input', renderAdminTable);

            requestSubmitBtn.addEventListener('click', async () => {
                const token = localStorage.getItem('token');
                if (!token) {
                    requestStatus.innerText = "Please log in first.";
                    requestStatus.style.color = "#ff4d4d";
                    return;
                }

                const payload = {
                    requestType: requestType.value,
                    subject: requestSubject.value.trim(),
                    details: requestDetails.value.trim(),
                    pageUrl: requestPageUrl.value.trim()
                };

                if (!payload.subject || !payload.details) {
                    requestStatus.innerText = "Subject and details are required.";
                    requestStatus.style.color = "#ff4d4d";
                    return;
                }

                requestSubmitBtn.disabled = true;
                requestSubmitBtn.innerText = "Submitting...";
                requestStatus.innerText = "";

                try {
                    const response = await fetch('/requests', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json();

                    if (response.ok) {
                        requestStatus.innerText = data.message || "Submitted successfully.";
                        requestStatus.style.color = "#28a745";
                        requestSubject.value = '';
                        requestDetails.value = '';
                        requestPageUrl.value = '';
                    } else {
                        requestStatus.innerText = data.error || "Could not submit request. Please try again.";
                        requestStatus.style.color = "#ff4d4d";
                    }
                } catch (_) {
                    requestStatus.innerText = "Server error. Please try again.";
                    requestStatus.style.color = "#ff4d4d";
                } finally {
                    requestSubmitBtn.disabled = false;
                    requestSubmitBtn.innerText = "Submit";
                }
            });

            function appendAiTextWithCode(parent, text) {
                const codeBlockPattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
                let lastIndex = 0;
                let match;
                let foundCode = false;

                while ((match = codeBlockPattern.exec(text)) !== null) {
                    const beforeCode = text.slice(lastIndex, match.index);
                    if (beforeCode) {
                        const textNode = document.createElement('div');
                        textNode.className = 'aiTextPart';
                        textNode.textContent = beforeCode.trim();
                        if (textNode.textContent) parent.appendChild(textNode);
                    }

                    foundCode = true;
                    const language = (match[1] || 'code').trim() || 'code';
                    const code = match[2] || '';
                    const codeBubble = document.createElement('div');
                    codeBubble.className = 'aiCodeBubble';

                    const codeHeader = document.createElement('div');
                    codeHeader.className = 'aiCodeHeader';

                    const codeLabel = document.createElement('span');
                    codeLabel.textContent = language;

                    const copyButton = document.createElement('button');
                    copyButton.type = 'button';
                    copyButton.className = 'aiCodeCopyBtn';
                    copyButton.textContent = 'Copy';
                    copyButton.addEventListener('click', async (event) => {
                        event.stopPropagation();
                        try {
                            await navigator.clipboard.writeText(code.trim());
                            copyButton.textContent = 'Copied';
                            setTimeout(() => {
                                copyButton.textContent = 'Copy';
                            }, 1200);
                        } catch (_) {
                            copyButton.textContent = 'Failed';
                            setTimeout(() => {
                                copyButton.textContent = 'Copy';
                            }, 1200);
                        }
                    });

                    codeHeader.append(codeLabel, copyButton);

                    const pre = document.createElement('pre');
                    const codeElement = document.createElement('code');
                    codeElement.textContent = code.trim();
                    pre.appendChild(codeElement);

                    codeBubble.append(codeHeader, pre);
                    parent.appendChild(codeBubble);
                    lastIndex = codeBlockPattern.lastIndex;
                }

                const afterCode = text.slice(lastIndex);
                if (afterCode) {
                    const textNode = document.createElement('div');
                    textNode.className = 'aiTextPart';
                    textNode.textContent = afterCode.trim();
                    if (textNode.textContent) parent.appendChild(textNode);
                }

                if (!foundCode && !parent.children.length) {
                    parent.textContent = text;
                }
            }

            function renderAiMessageContent(message, text, allowCodeBubbles = false) {
                message.innerHTML = '';
                if (allowCodeBubbles) {
                    appendAiTextWithCode(message, text);
                } else {
                    message.textContent = text;
                }
            }

            function appendAiMessage(role, text, extraClass = '', allowCodeBubbles = false) {
                const message = document.createElement('div');
                message.className = `aiChatMessage ${role === 'user' ? 'userMessage' : 'aiMessage'} ${extraClass}`.trim();
                renderAiMessageContent(message, text, allowCodeBubbles);
                aiChatMessages.appendChild(message);
                aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
                return message;
            }

            function setAiLoading(isLoading) {
                aiChatSend.disabled = isLoading;
                aiChatInput.disabled = isLoading;
                aiChatSend.textContent = isLoading ? '...' : 'Send';
            }

            aiChatInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    aiChatForm.requestSubmit();
                }
            });

            aiChatForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                const token = localStorage.getItem('token');
                const prompt = aiChatInput.value.trim();
                if (!prompt || !token) return;

                aiChatInput.value = '';
                appendAiMessage('user', prompt);
                aiConversation.push({ role: 'user', content: prompt });

                const typingMessage = appendAiMessage('assistant', 'Thinking...');
                setAiLoading(true);

                try {
                    const response = await fetch('/ai/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ messages: aiConversation.slice(-12) })
                    });
                    const data = await response.json().catch(() => ({}));

                    if (!response.ok) {
                        throw new Error(data.error || 'Tempest AI could not answer right now.');
                    }

                    const answer = data.reply || 'I did not get a response.';
                    renderAiMessageContent(typingMessage, answer, true);
                    aiConversation.push({ role: 'assistant', content: answer });

                    while (aiConversation.length > 12) aiConversation.shift();
                } catch (err) {
                    typingMessage.textContent = err.message || 'Tempest AI had a problem answering.';
                    typingMessage.classList.add('aiErrorMessage');
                } finally {
                    setAiLoading(false);
                    aiChatInput.focus();
                    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
                }
            });

            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const btnRect = userMenuBtn.getBoundingClientRect();
                userDropdown.style.top = `${btnRect.top}px`;
                userDropdown.style.left = `calc(var(--sidebar-width) + var(--sidebar-margin-left) + 10px)`;
                userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
            });

            document.addEventListener('click', (e) => {
                if (!userMenuWrap.contains(e.target) && !userDropdown.contains(e.target)) {
                    userDropdown.style.display = 'none';
                }
            });

            settingsIcon.onclick = function (e) {
                e.stopPropagation();
                const isOpening = settingsMenu.style.display !== "block";
                settingsMenu.style.display = isOpening ? "block" : "none";
                if (!isOpening) return;

                const iconRect = settingsIcon.getBoundingClientRect();
                const menuHeight = settingsMenu.offsetHeight;
                const minTop = 10;
                const calculatedTop = iconRect.bottom - menuHeight;
                settingsMenu.style.top = `${Math.max(minTop, calculatedTop)}px`;
                settingsMenu.style.left = `calc(var(--sidebar-width) + var(--sidebar-margin-left) + 10px)`;
            };

            document.addEventListener("click", (e) => {
                if (!settingsMenu.contains(e.target) && e.target !== settingsIcon) {
                    settingsMenu.style.display = "none";
                }
            });

            const saved = getSavedUiSettings();
            const savedExtra = JSON.parse(localStorage.getItem("sspExtraSettings")) || { glowColor: "#9b59b6", fullscreen: false };

            const toggleGlow = document.getElementById("toggleGlow");
            const toggleClock = document.getElementById("toggleClock");
            const toggleAi = document.getElementById("toggleAi");
            const toggleMusic = document.getElementById("toggleMusic");
            const musicTrackSelect = document.getElementById("musicTrackSelect");

            toggleGlow.checked = saved.glow;
            toggleClock.checked = saved.clock;
            toggleAi.checked = saved.ai !== false;
            toggleMusic.checked = saved.musicOn !== false;

            function applySettings(s) {
                s.glow ? document.body.classList.remove("noGlow") : document.body.classList.add("noGlow");
                clock.style.display = s.clock ? "block" : "none";
                updateAiChatVisibility();

                if (bgAudio) {
                    if (s.musicTrack) {
                        bgAudio.src = `/music/${encodeURIComponent(s.musicTrack)}`;
                    }
                    if (s.musicOn === false) {
                        bgAudio.pause();
                    } else {
                        bgAudio.play().catch(() => {});
                    }
                }
            }

            function saveSettings() {
                const s = { glow: toggleGlow.checked, clock: toggleClock.checked, ai: toggleAi.checked, musicOn: toggleMusic.checked, musicTrack: musicTrackSelect.value };
                localStorage.setItem("sspSettings", JSON.stringify(s));
                applySettings(s);
            }

            toggleGlow.onchange = saveSettings;
            toggleClock.onchange = saveSettings;
            toggleAi.onchange = saveSettings;
            toggleMusic.onchange = saveSettings;
            musicTrackSelect.onchange = saveSettings;

            aiChatHideBtn.addEventListener('click', () => {
                toggleAi.checked = false;
                saveSettings();
            });

            function applyExtraSettings(s) {
                document.documentElement.style.setProperty('--glow-color', s.glowColor);
                glowColorInput.value = s.glowColor;
                toggleFullscreen.checked = s.fullscreen;
                if (s.fullscreen && !document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                }
                updateGlowColorRgb();
            }

            function saveExtraSettings() {
                const s = {
                    glowColor: glowColorInput.value,
                    fullscreen: toggleFullscreen.checked
                };
                localStorage.setItem("sspExtraSettings", JSON.stringify(s));
                applyExtraSettings(s);
            }

            glowColorInput.onchange = saveExtraSettings;
            toggleFullscreen.onchange = () => {
                toggleFullscreen.checked
                    ? document.documentElement.requestFullscreen().catch(() => {})
                    : document.exitFullscreen().catch(() => {});
                saveExtraSettings();
            };


            async function loadMusicTracks() {
                if (!musicTrackSelect) return;
                try {
                    const response = await fetch('/music-files');
                    if (!response.ok) return;
                    const data = await response.json();
                    const files = Array.isArray(data.files) ? data.files : [];
                    musicTrackSelect.innerHTML = '';
                    files.forEach((name) => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        musicTrackSelect.appendChild(option);
                    });
                    if (saved.musicTrack && files.includes(saved.musicTrack)) {
                        musicTrackSelect.value = saved.musicTrack;
                    } else if (files.length) {
                        musicTrackSelect.value = files[0];
                    }
                } catch (_) {}
            }

            loadMusicTracks();
            applySettings(saved);
            applyExtraSettings(savedExtra);

            window.addEventListener('contextmenu', e => e.preventDefault());

            titleHeader.onclick = () => {
                hideAllSections();
                homeContent.style.display = "flex";
                contentFrame.src = "";
                requestAnimationFrame(() => homeSearchInput.focus());
            };

            function setupSearch(searchInputId, containerId) {
                const searchBar = document.getElementById(searchInputId);
                const container = document.getElementById(containerId);
                searchBar.addEventListener("input", () => {
                    const searchText = searchBar.value.toLowerCase();
                    const cards = container.querySelectorAll(".gameCard");
                    cards.forEach(card => {
                        const title = card.querySelector(".gameTitle").textContent.toLowerCase();
                        card.style.display = title.includes(searchText) ? "flex" : "none";
                    });
                });
            }
            setupSearch('gamesSearchBar', 'gamesLinksContainer');
            setupSearch('appsSearchBar', 'appsLinksContainer');

            homeSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                let typed = homeSearchInput.value.trim();
                if (!typed) return;

                const hasScheme = /^https?:\/\//i.test(typed);
                const looksLikeDomain = /^[^\s/]+\.[^\s]+/.test(typed);
                if (!hasScheme && looksLikeDomain) {
                    typed = `https://${typed}`;
                }

                const target = `/p/search/${encodeURIComponent(typed)}?showbar`;
                hideAllSections();
                activateEmbeddedFrame(proxyIframe);
                proxyContent.style.display = "block";
                proxyIframe.src = target;
            });

            window.runTool = function (type) {
                switch (type) {
                    case 'autoclicker':
                        fetch('https://cdn.jsdelivr.net/gh/wea-f/Norepted@a4cd53b/bookmarklets/autoclicker.js')
                            .then(r => r.text()).then(eval);
                        break;
                    case 'asteroids':
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/gh/skysthelimitt/Selenite/js/asteroids.min.js';
                        document.body.appendChild(s);
                        break;
                }
            };

            const canvas = document.getElementById('particleCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            });

            let particles = [], sparkles = [];
            const maxParticles = 300, maxSparkles = 50;
            let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

            window.addEventListener('mousemove', e => {
                mouse.x = e.clientX;
                mouse.y = e.clientY;
            });

            function spawnParticle() {
                const edge = Math.floor(Math.random() * 4);
                let x, y;
                switch (edge) {
                    case 0: x = Math.random() * canvas.width; y = 0; break;
                    case 1: x = canvas.width; y = Math.random() * canvas.height; break;
                    case 2: x = Math.random() * canvas.width; y = canvas.height; break;
                    default: x = 0; y = Math.random() * canvas.height; break;
                }
                particles.push({
                    x, y,
                    size: 2 + Math.random() * 5,
                    speed: 0.3 + Math.random() * 0.5,
                    opacity: 0.2 + Math.random() * 0.5,
                    angle: Math.random() * 360
                });
                if (particles.length > maxParticles) particles.shift();
            }

            function spawnSparkles() {
                if (Math.random() < 0.2 && sparkles.length < maxSparkles) {
                    sparkles.push({
                        x: mouse.x + Math.random() * 50 - 25,
                        y: mouse.y + Math.random() * 50 - 25,
                        size: 1 + Math.random() * 3,
                        opacity: 0.2 + Math.random() * 0.5
                    });
                }
            }

            function addClickParticles() {
                for (let i = 0; i < 5; i++) {
                    particles.push({
                        x: mouse.x + Math.random() * 20 - 10,
                        y: mouse.y + Math.random() * 20 - 10,
                        size: 2 + Math.random() * 4,
                        speed: 0.3 + Math.random() * 0.5,
                        opacity: 0.3 + Math.random() * 0.5,
                        angle: Math.random() * 360
                    });
                }
            }

            canvas.addEventListener('mousedown', addClickParticles);
            canvas.addEventListener('mousemove', e => {
                if (e.buttons) addClickParticles(e);
            });

            function animate() {
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                particles.forEach((p, i) => {
                    const dx = mouse.x - p.x;
                    const dy = mouse.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 3) {
                        p.x += dx * 0.03;
                        p.y += dy * 0.03;
                        p.angle += 0.1;

                        ctx.save();
                        ctx.translate(p.x, p.y);
                        ctx.rotate(p.angle);
                        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--glow-color').trim();
                        ctx.globalAlpha = p.opacity;
                        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                        ctx.restore();
                    } else {
                        particles.splice(i, 1);
                    }
                });

                sparkles.forEach((s, i) => {
                    s.opacity -= 0.01;
                    if (s.opacity <= 0) {
                        sparkles.splice(i, 1);
                        return;
                    }
                    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--glow-color').trim();
                    ctx.globalAlpha = s.opacity;
                    ctx.fillRect(s.x, s.y, s.size, s.size);
                });

                spawnParticle();
                spawnSparkles();
                requestAnimationFrame(animate);
            }
            animate();

            window.fullscreenFrame = function () {
                const frame = document.getElementById("contentFrame");
                const proxy = document.getElementById("proxyIframe");
                const proxyWrap = document.getElementById("proxyContent");
                const request = document.getElementById("requestContent");

                let active = null;
                if (frame.classList.contains('is-frame-active')) active = frame;
                else if (proxy.classList.contains('is-frame-active') || proxyWrap.style.display === "block") active = proxy;
                else if (request.style.display === "block") active = document.documentElement;

                if (!active) return;

                if (!document.fullscreenElement) {
                    active.requestFullscreen().catch((e) => console.error("Fullscreen failed:", e));
                } else {
                    document.exitFullscreen().catch((e) => console.error("Exit fullscreen failed:", e));
                }
            };

            window.refreshFrame = function () {
                const frame = document.getElementById("contentFrame");
                const proxy = document.getElementById("proxyIframe");
                const request = document.getElementById("requestContent");

                if (frame.classList.contains('is-frame-active')) {
                    frame.src = frame.src;
                } else if (proxy.classList.contains('is-frame-active') || document.getElementById("proxyContent").style.display === "block") {
                    proxy.src = proxy.src;
                } else if (request.style.display === "block") {
                    request.scrollTo({ top: 0, behavior: 'smooth' });
                }
            };
        })();
          const audio = document.getElementById("bgAudio");

  function tryPlay() {
    audio.play().catch(() => {});
  }

  // Try immediately
  window.addEventListener("load", tryPlay);

  // Fallback: play on first interaction
  document.addEventListener("click", () => {
    audio.play();
  }, { once: true });

  document.addEventListener("keydown", () => {
    audio.play();
  }, { once: true });
