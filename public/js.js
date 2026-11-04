(function () {
    'use strict';

    const authOverlay = document.getElementById('authOverlay');
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
    const messagesContent = document.getElementById('messagesContent');
    const messagesList = document.getElementById('messagesList');
    const messagesStatus = document.getElementById('messagesStatus');
    const proxyContent = document.getElementById('proxyContent');
    const adminDashboard = document.getElementById('adminDashboard');
    const contentFrame = document.getElementById('contentFrame');
    const titleHeader = document.getElementById('titleHeader');
    const proxyIframe = document.getElementById('proxyIframe');
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
    const addGameFile = document.getElementById('addGameFile');
    const addGameIcon = document.getElementById('addGameIcon');
    const addGameUnblock = document.getElementById('addGameUnblock');
    const addGameUrlWrap = document.getElementById('addGameUrlWrap');
    const addGameHtmlWrap = document.getElementById('addGameHtmlWrap');
    const addGameFileWrap = document.getElementById('addGameFileWrap');
    const addGameSubmitBtn = addGameForm.querySelector('button[type="submit"]');

    const adminMessageForm = document.getElementById('adminMessageForm');
    const adminMessageKind = document.getElementById('adminMessageKind');
    const adminMessageRecipient = document.getElementById('adminMessageRecipient');
    const adminMessageRecipientWrap = document.getElementById('adminMessageRecipientWrap');
    const adminMessageBody = document.getElementById('adminMessageBody');
    const adminMessageStatus = document.getElementById('adminMessageStatus');
    const adminMessageSubmit = document.getElementById('adminMessageSubmit');

    const toggleShortcutButton = document.getElementById('toggleShortcutButton');
    const shortcutSettingStatus = document.getElementById('shortcutSettingStatus');

    const newsBanner = document.getElementById('newsBanner');
    const newsBannerClose = document.getElementById('newsBannerClose');

    const SEEN_NEWS_KEY = 'seenNewsIds';
    const NEWS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    let heartbeatInterval;
    let messageRefreshInterval;
    let activeModalResolve = null;
    let adminUsersCache = [];
    let adminCustomGamesCache = [];
    let editingCustomGameId = '';
    let siteMessagesCache = [];
    let shortcutEnabled = false;
    let bannerDismissedIds = new Set();
    const aiConversation = [];

    function updateGlowColorRgb() {
        const color = getComputedStyle(document.documentElement)
            .getPropertyValue('--glow-color')
            .trim();
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

            sspModalConfirm.onclick = () => cleanup({
                confirmed: true,
                value: sspModalInput.value.trim()
            });
            sspModalCancel.onclick = () => cleanup({
                confirmed: false,
                value: ''
            });
            activeModalResolve = cleanup;
        });
    }

    sspModalOverlay.addEventListener('click', (event) => {
        if (event.target === sspModalOverlay && activeModalResolve) {
            activeModalResolve({ confirmed: false, value: '' });
        }
    });

    function getSavedUiSettings() {
        let savedSettings = {};
        try {
            savedSettings = JSON.parse(localStorage.getItem('sspSettings')) || {};
        } catch (_) {}
        return {
            glow: true,
            clock: true,
            ai: true,
            musicOn: true,
            musicTrack: '',
            ...savedSettings
        };
    }

    function shouldShowAiChat() {
        return Boolean(localStorage.getItem('token')) &&
            getSavedUiSettings().ai !== false;
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
            loadMessages();
            if (messageRefreshInterval) clearInterval(messageRefreshInterval);
            messageRefreshInterval = setInterval(loadMessages, 60000);
        } else {
            authOverlay.style.display = 'flex';
            userMenuWrap.style.display = 'none';
            userDropdown.style.display = 'none';
            adminPanelBtn.style.display = 'none';
            if (newsBanner) newsBanner.style.display = 'none';
            updateAiChatVisibility();
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            if (messageRefreshInterval) clearInterval(messageRefreshInterval);
            clearRenderedCustomGames();
            siteMessagesCache = [];
            bannerDismissedIds.clear();
            if (messagesList) messagesList.replaceChildren();
        }

        requestAnimationFrame(() => {
            if (typeof fitSidebarToViewport === 'function') fitSidebarToViewport();
        });
    }
    checkLoginStatus();

    window.handleGoogleCredential = async function ({ credential }) {
        authMessage.innerText = 'Authenticating...';
        authMessage.style.color = '#d580ff';

        try {
            const response = await fetch('/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential })
            });
            const data = await response.json();

            if (data.token) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('username', data.username || 'Account');
                authMessage.innerText = 'Access Granted.';
                authMessage.style.color = '#28a745';
                setTimeout(checkLoginStatus, 500);
            } else {
                if (data.banned) {
                    const reason = data.banReason || 'No reason provided';
                    await openSiteModal({
                        title: 'Account Banned',
                        text: `You are banned from Unbreaking.\nReason: ${reason}`,
                        confirmText: 'OK',
                        cancelText: 'Close',
                        dismissible: true
                    });
                    authMessage.innerText = `Banned: ${reason}`;
                } else {
                    authMessage.innerText = data.error || 'Sign-in failed.';
                }
                authMessage.style.color = '#ff4d4d';
            }
        } catch (_) {
            authMessage.innerText = 'Server error. Try again later.';
            authMessage.style.color = '#ff4d4d';
        }
    };

    function renderGoogleSignInButton() {
        if (!window.google?.accounts?.id) {
            return setTimeout(renderGoogleSignInButton, 100);
        }

        google.accounts.id.initialize({
            client_id: '602370462698-t537s1b57epqb3jvigscrmmp1ls9pf42.apps.googleusercontent.com',
            callback: window.handleGoogleCredential,
            auto_select: false
        });
        google.accounts.id.renderButton(
            document.getElementById('googleSignInButton'),
            { theme: 'outline', size: 'large', text: 'signin_with', width: 280 }
        );
    }
    renderGoogleSignInButton();

    function forceLogout(message) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (messageRefreshInterval) clearInterval(messageRefreshInterval);
        hideAllSections();
        homeContent.style.display = 'flex';
        checkLoginStatus();
        authMessage.innerText = message;
        authMessage.style.color = '#ff4d4d';
    }

    userLogoutBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        if (token) {
            userLogoutBtn.innerText = 'Logging out...';
            try {
                await fetch('/offline', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (_) {}
        }
        forceLogout('Logged out securely.');
        authMessage.style.color = '#d580ff';
        userLogoutBtn.innerText = 'Log Out';
    });

    function formatLastSeen(lastSeen) {
        if (!lastSeen || Number(lastSeen) <= 0) return 'Never';
        const date = new Date(Number(lastSeen));
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    }

    async function loadAdminData() {
        const token = localStorage.getItem('token');

        try {
            const response = await fetch('/admin/users', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Could not load users.');
            adminUsersCache = await response.json();
            renderAdminTable();
            populateAdminMessageRecipients();
        } catch (_) {
            const tbody = document.getElementById('adminUserTableBody');
            tbody.innerHTML = '<tr><td colspan="6">Could not load users.</td></tr>';
        }
    }

    function populateAdminMessageRecipients() {
        if (!adminMessageRecipient) return;

        const previousValue = adminMessageRecipient.value;
        adminMessageRecipient.replaceChildren();

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a user';
        adminMessageRecipient.appendChild(placeholder);

        adminUsersCache.forEach((user) => {
            const option = document.createElement('option');
            option.value = String(user.id);
            option.textContent = `${user.username || 'User'}${user.email ? ` (${user.email})` : ''}`;
            adminMessageRecipient.appendChild(option);
        });

        if (adminUsersCache.some((user) => String(user.id) === previousValue)) {
            adminMessageRecipient.value = previousValue;
        }
    }

    function renderAdminTable() {
        const tbody = document.getElementById('adminUserTableBody');
        const searchText = (
            document.getElementById('adminSearchBar').value || ''
        ).toLowerCase().trim();

        tbody.innerHTML = '';

        adminUsersCache
            .filter((user) => {
                if (!searchText) return true;
                const username = (user.username || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                return username.includes(searchText) || email.includes(searchText);
            })
            .forEach((user) => {
                const row = document.createElement('tr');
                const status = document.createElement('td');
                const online = document.createElement('td');
                const lastOnline = document.createElement('td');
                const actions = document.createElement('td');

                status.textContent = user.is_banned ? 'BANNED' : 'Active';

                const badge = document.createElement('span');
                badge.className = `statusBadge ${user.is_online ? 'online' : 'offline'}`;
                badge.textContent = user.is_online ? 'Online' : 'Offline';
                online.appendChild(badge);

                lastOnline.textContent =
                    user.is_online ? 'Online now' : formatLastSeen(user.last_seen);

                const username = document.createElement('td');
                username.textContent = user.username || '';
                const email = document.createElement('td');
                email.textContent = user.email || '';

                if (!user.is_banned) {
                    const button = document.createElement('button');
                    button.className = 'adminActionBtn btn-ban';
                    button.textContent = 'Ban';
                    button.addEventListener('click', () => window.adminAction(user.id, 'ban'));
                    actions.appendChild(button);
                } else {
                    const button = document.createElement('button');
                    button.className = 'adminActionBtn btn-unban';
                    button.textContent = 'Unban';
                    button.addEventListener('click', () => window.adminAction(user.id, 'unban'));
                    actions.appendChild(button);
                }

                row.append(username, email, status, online, lastOnline, actions);
                tbody.appendChild(row);
            });
    }

    async function loadAdminCustomGames() {
        const token = localStorage.getItem('token');
        const tbody = document.getElementById('adminCustomGameTableBody');
        if (!tbody) return;

        try {
            const response = await fetch('/admin/custom-games', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Could not load custom games.');
            adminCustomGamesCache = await response.json();
            renderAdminCustomGamesTable();
        } catch (_) {
            tbody.innerHTML = '<tr><td colspan="7">Could not load custom games.</td></tr>';
        }
    }

    function renderAdminCustomGamesTable() {
        const tbody = document.getElementById('adminCustomGameTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!adminCustomGamesCache.length) {
            tbody.innerHTML = '<tr><td colspan="7">No custom games found.</td></tr>';
            return;
        }

        adminCustomGamesCache.forEach((game) => {
            const row = document.createElement('tr');
            const status = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `statusBadge ${game.is_published ? 'online' : 'offline'}`;
            statusBadge.textContent = game.is_published ? 'Published' : 'Private';
            status.appendChild(statusBadge);

            const target = game.game_type === 'html'
                ? 'HTML game'
                : game.game_type === 'file'
                    ? (game.file_name || 'Uploaded file')
                    : (game.target_url || 'No URL');

            [
                game.name || '',
                game.username || 'Unknown User',
                game.game_type || '',
                target
            ].forEach((value) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });

            row.appendChild(status);

            const created = document.createElement('td');
            created.textContent = new Date(game.created_at).toLocaleString();
            row.appendChild(created);

            const actions = document.createElement('td');
            const publishButton = document.createElement('button');
            publishButton.className = `adminActionBtn ${game.is_published ? 'btn-unpublish' : 'btn-approve'}`;
            publishButton.textContent = game.is_published ? 'Unpublish' : 'Publish';
            publishButton.addEventListener('click', () => {
                window.adminCustomGameAction(game.id, game.is_published ? 'unpublish' : 'publish');
            });

            const deleteButton = document.createElement('button');
            deleteButton.className = 'adminActionBtn btn-ban';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => {
                window.adminCustomGameAction(game.id, 'delete');
            });

            actions.append(publishButton, deleteButton);
            row.appendChild(actions);
            tbody.appendChild(row);
        });
    }

    window.adminCustomGameAction = async function (gameId, action) {
        if (action === 'delete') {
            const modalResult = await openSiteModal({
                title: 'Delete Custom Game',
                text: 'Delete this custom game from every account? This cannot be undone.',
                confirmText: 'Delete',
                cancelText: 'Cancel',
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
                title: 'Ban User',
                text: 'Type why this account is banned. This message will be shown when they try to log in.',
                confirmText: 'Ban User',
                cancelText: 'Cancel',
                showInput: true,
                placeholder: 'Being mean.',
                dangerConfirm: true
            });

            if (!modalResult.confirmed) return;
            reason = modalResult.value || 'No reason provided';
        }

        try {
            const response = await fetch('/admin/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userId, action, reason })
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert(`Error performing action: ${errorData.error || response.statusText}`);
            }
        } catch (_) {
            alert('Network error or server unavailable.');
        }

        loadAdminData();
    };

    async function refreshShortcutSetting() {
        if (!toggleShortcutButton || !shortcutSettingStatus) return;

        try {
            const response = await fetch('/shortcut-setting');
            if (!response.ok) throw new Error('Could not load shortcut setting.');

            const data = await response.json();
            shortcutEnabled = data?.enabled === true;

            toggleShortcutButton.textContent = shortcutEnabled
                ? 'Disable Shift+U'
                : 'Enable Shift+U';
            toggleShortcutButton.classList.add('adminActionBtn');
            toggleShortcutButton.classList.toggle('btn-ban', shortcutEnabled);
            toggleShortcutButton.classList.toggle('btn-approve', !shortcutEnabled);

            shortcutSettingStatus.textContent = shortcutEnabled
                ? 'Shift+U is enabled on index.html.'
                : 'Shift+U is disabled on index.html.';
        } catch (_) {
            shortcutSettingStatus.textContent = 'Could not load shortcut status.';
        }
    }

    async function toggleShortcutSetting() {
        const token = localStorage.getItem('token');
        if (!token || !isCurrentUserAdmin()) return;

        if (toggleShortcutButton) toggleShortcutButton.disabled = true;

        try {
            const response = await fetch('/shortcut-setting', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ enabled: !shortcutEnabled })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Could not update shortcut setting.');
            }

            await refreshShortcutSetting();
        } catch (error) {
            alert(error.message || 'Could not update shortcut setting.');
        } finally {
            if (toggleShortcutButton) toggleShortcutButton.disabled = false;
        }
    }

    function getSeenNewsIds() {
        try {
            const ids = JSON.parse(localStorage.getItem(SEEN_NEWS_KEY) || '[]');
            return new Set(Array.isArray(ids) ? ids.map(String) : []);
        } catch (_) {
            return new Set();
        }
    }

    function getUnreadRecentNews() {
        const seenIds = getSeenNewsIds();
        const cutoff = Date.now() - NEWS_MAX_AGE_MS;

        return siteMessagesCache
            .filter((message) => {
                if (message.kind !== 'news' || seenIds.has(String(message.id))) {
                    return false;
                }

                const createdAt = new Date(message.created_at).getTime();
                return Number.isFinite(createdAt) &&
                    createdAt <= Date.now() &&
                    createdAt >= cutoff;
            })
            .sort((first, second) =>
                new Date(second.created_at).getTime() -
                new Date(first.created_at).getTime()
            );
    }

    function markNewsAsSeen(messageId) {
        const seenIds = getSeenNewsIds();
        seenIds.add(String(messageId));
        localStorage.setItem(SEEN_NEWS_KEY, JSON.stringify([...seenIds]));
        bannerDismissedIds.delete(String(messageId));

        showLatestNewsBanner();

        if (messagesContent && messagesContent.style.display === 'block') {
            renderMessages();
        }
    }

    function createNewsCard(message) {
        const card = document.createElement('article');
        card.className = 'siteMessageCard siteNewsCard';

        const heading = document.createElement('h2');
        heading.textContent = 'News';

        const body = document.createElement('p');
        body.className = 'siteMessageBody';
        body.textContent = message.body || '';

        const details = document.createElement('small');
        details.textContent = message.created_at
            ? new Date(message.created_at).toLocaleString()
            : '';

        const seenButton = document.createElement('button');
        seenButton.type = 'button';
        seenButton.className = 'adminActionBtn btn-approve';
        seenButton.textContent = 'Mark as seen';
        seenButton.addEventListener('click', () => markNewsAsSeen(message.id));

        card.append(heading, body, details, seenButton);
        return card;
    }

    function showLatestNewsBanner() {
        if (!newsBanner) return;

        const unreadNews = getUnreadRecentNews()
            .filter((message) => !bannerDismissedIds.has(String(message.id)));
        const content = newsBanner.querySelector('.newsBannerContent');

        if (!unreadNews.length || !content) {
            newsBanner.style.display = 'none';
            return;
        }

        content.replaceChildren();

        const heading = document.createElement('strong');
        heading.textContent = 'New announcements';

        const list = document.createElement('div');
        list.className = 'newsAnnouncementList';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '10px';

        unreadNews.forEach((message) => {
            list.appendChild(createNewsCard(message));
        });

        content.append(heading, list);
        newsBanner.style.display = 'flex';
    }

    if (newsBannerClose) {
        newsBannerClose.addEventListener('click', () => {
            getUnreadRecentNews().forEach((message) => {
                bannerDismissedIds.add(String(message.id));
            });
            newsBanner.style.display = 'none';
        });
    }

    async function loadMessages() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch('/messages', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.status === 401) {
                forceLogout('Session expired. Please log in again.');
                return;
            }
            if (!response.ok) throw new Error('Could not load messages.');

            const data = await response.json();
            siteMessagesCache = Array.isArray(data.messages) ? data.messages : [];
            showLatestNewsBanner();

            if (messagesContent && messagesContent.style.display === 'block') {
                renderMessages();
            }
        } catch (_) {
            if (messagesStatus) {
                messagesStatus.textContent = 'Messages could not be loaded. Please try again.';
            }
        }
    }

    function renderMessages() {
        if (!messagesList) return;
        messagesList.replaceChildren();

        const news = getUnreadRecentNews();
        const directMessages = siteMessagesCache
            .filter((message) => message.kind !== 'news')
            .sort((first, second) =>
                new Date(second.created_at).getTime() -
                new Date(first.created_at).getTime()
            );

        if (!news.length && !directMessages.length) {
            messagesStatus.textContent = 'You do not have any new messages.';
            return;
        }

        messagesStatus.textContent = '';

        news.forEach((message) => {
            messagesList.appendChild(createNewsCard(message));
        });

        directMessages.forEach((message) => {
            const card = document.createElement('article');
            card.className = 'siteMessageCard siteDirectMessageCard';

            const kind = document.createElement('p');
            kind.className = 'siteMessageKind';
            kind.textContent = 'Admin message';

            const body = document.createElement('p');
            body.className = 'siteMessageBody';
            body.textContent = message.body || '';

            const details = document.createElement('small');
            const date = message.created_at
                ? new Date(message.created_at).toLocaleString()
                : '';
            details.textContent =
                `${message.sender ? `From ${message.sender} · ` : ''}${date}`;

            card.append(kind, body, details);
            messagesList.appendChild(card);
        });
    }

    window.showMessages = function () {
        hideAllSections();
        messagesContent.style.display = 'block';
        renderMessages();
        loadMessages();
    };

    function setAdminMessageKindUi() {
        if (!adminMessageKind || !adminMessageRecipientWrap || !adminMessageRecipient) return;
        const isNews = adminMessageKind.value === 'news';
        adminMessageRecipientWrap.style.display = isNews ? 'none' : 'block';
        adminMessageRecipient.required = !isNews;
        if (adminMessageSubmit) {
            adminMessageSubmit.textContent = isNews ? 'Post News' : 'Send Message';
        }
    }

    if (adminMessageKind) {
        adminMessageKind.addEventListener('change', setAdminMessageKindUi);
        setAdminMessageKindUi();
    }

    if (adminMessageForm) {
        adminMessageForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!isCurrentUserAdmin()) return;

            const token = localStorage.getItem('token');
            const kind = adminMessageKind.value;
            const payload = {
                kind,
                body: adminMessageBody.value.trim()
            };

            if (kind !== 'news') {
                payload.userId = Number(adminMessageRecipient.value);
            }

            if (!payload.body || (kind !== 'news' && !payload.userId)) {
                adminMessageStatus.textContent = 'Choose a recipient and enter a message.';
                return;
            }

            adminMessageSubmit.disabled = true;
            adminMessageStatus.textContent =
                kind === 'news' ? 'Posting news…' : 'Sending message…';

            try {
                const response = await fetch('/admin/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || 'Could not send this message.');
                }

                adminMessageStatus.textContent = data.message || 'Done.';
                adminMessageForm.reset();
                setAdminMessageKindUi();
                if (kind === 'news') await loadMessages();
            } catch (error) {
                adminMessageStatus.textContent =
                    error.message || 'Could not send this message.';
            } finally {
                adminMessageSubmit.disabled = false;
            }
        });
    }

    async function sendHeartbeat() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch('/heartbeat', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 401) {
                forceLogout('Session expired. Please log in again.');
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
            navigator.sendBeacon(
                '/offline',
                new Blob([JSON.stringify({ token })], { type: 'application/json' })
            );
            fetch('/offline', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                keepalive: true
            }).catch(() => {});
        }
    });

    function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        clock.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    function fitSidebarToViewport() {
        const sideNavBar = document.getElementById('sideNavBar');
        if (!sideNavBar) return;

        document.documentElement.style.setProperty('--sidebar-scale', '1');
        const viewportHeight = window.innerHeight;
        const targetHeight = sideNavBar.scrollHeight;
        const maxAllowedHeight = Math.max(200, viewportHeight - 24);
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
        return String(unsafe || '').replace(/[&<>"']/g, (character) => {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return map[character] || character;
        });
    }

    function isCurrentUserAdmin() {
        return localStorage.getItem('role') === 'admin';
    }

    function databaseIdFromCustomId(customId) {
        const match = String(customId || '').match(/^cg-(\d+)$/);
        return match ? Number(match[1]) : 0;
    }

    function isHtmlFileName(fileName) {
        return /\.html?$/i.test(String(fileName || ''));
    }

    function openUploadedHtml(dataUrl) {
        try {
            const comma = dataUrl.indexOf(',');
            if (comma < 0) throw new Error('Invalid uploaded HTML data.');
            const header = dataUrl.slice(0, comma);
            const encoded = dataUrl.slice(comma + 1);
            let html;

            if (/;base64/i.test(header)) {
                const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
                html = new TextDecoder().decode(bytes);
            } else {
                html = decodeURIComponent(encoded);
            }

            window.loadGameHtml(html);
        } catch (_) {
            alert('This uploaded HTML file could not be opened.');
        }
    }

    function downloadUploadedFile(game) {
        const fileData = String(game.fileData || '');
        const fileName = String(game.fileName || 'download');

        if (!fileData.startsWith('data:')) {
            alert('This uploaded file is unavailable.');
            return;
        }

        const link = document.createElement('a');
        link.href = fileData;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function openCustomGame(game) {
        if (game.type === 'html') {
            window.loadGameHtml(game.html || '');
            return;
        }

        if (game.type === 'file') {
            if (isHtmlFileName(game.fileName)) {
                openUploadedHtml(game.fileData || '');
            } else {
                downloadUploadedFile(game);
            }
            return;
        }

        const url = normalizeUrlInput(game.url || '');
        if (!url) return;

        if (game.unblock !== false) {
            window.loadGame(`/search/${encodeURIComponent(url)}`);
        } else {
            window.loadGame(url);
        }
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

        const image = document.createElement('img');
        image.src = game.icon || '/images/games.png';
        image.alt = game.name || 'Custom game';
        const title = document.createElement('div');
        title.className = 'gameTitle';
        title.textContent = game.name || 'Custom game';
        card.append(image, title);

        card.addEventListener('click', () => openCustomGame(game));

        const actions = document.createElement('div');
        actions.className = 'customCardActions';

        if (isOwned) {
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'customCardBtn';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openCustomGameEditor(card);
            });
            actions.appendChild(editButton);
        }

        if (isCurrentUserAdmin()) {
            const gameId = databaseIdFromCustomId(game.customId);
            if (gameId) {
                const publishButton = document.createElement('button');
                publishButton.type = 'button';
                publishButton.className = 'customCardBtn';
                publishButton.textContent = game.published ? 'Unpublish' : 'Publish';
                publishButton.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    await performAdminCustomGameAction(
                        gameId,
                        game.published ? 'unpublish' : 'publish'
                    );
                });
                actions.appendChild(publishButton);
            }
        }

        const canDeleteAsAdmin =
            isCurrentUserAdmin() && databaseIdFromCustomId(game.customId);

        if (isOwned || canDeleteAsAdmin) {
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'customCardBtn customCardBtnDanger';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', async (event) => {
                event.stopPropagation();

                if (canDeleteAsAdmin) {
                    const result = await openSiteModal({
                        title: 'Delete Custom Game',
                        text: 'Delete this custom game from every account? This cannot be undone.',
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                        dangerConfirm: true
                    });
                    if (!result.confirmed) return;
                    await performAdminCustomGameAction(
                        databaseIdFromCustomId(game.customId),
                        'delete'
                    );
                    return;
                }

                card.remove();
                if (editingCustomGameId && card.dataset.customGameId === editingCustomGameId) {
                    resetAddGameForm();
                }
                await syncCustomGamesToUser();
            });
            actions.appendChild(deleteButton);
        }

        if (actions.children.length) card.appendChild(actions);
        gamesLinksContainer.appendChild(card);
        sortGameCards();
        return card;
    }

    function sortGameCards() {
        const cards = Array.from(
            gamesLinksContainer.querySelectorAll(':scope > .gameCard')
        );
        const collator = new Intl.Collator(undefined, {
            sensitivity: 'base',
            numeric: true
        });

        cards.sort((first, second) => {
            const firstName = first.querySelector('.gameTitle')?.textContent?.trim() || '';
            const secondName = second.querySelector('.gameTitle')?.textContent?.trim() || '';
            return collator.compare(firstName, secondName);
        });

        cards.forEach((card) => gamesLinksContainer.appendChild(card));
    }
    sortGameCards();

    function clearRenderedCustomGames() {
        gamesLinksContainer
            .querySelectorAll('[data-custom-game="1"]')
            .forEach((card) => card.remove());
    }

    function getCustomGamesFromDom() {
        const games = [];
        gamesLinksContainer
            .querySelectorAll('[data-owned-custom-game="1"]')
            .forEach((card) => {
                const payload = card.dataset.customGamePayload;
                if (!payload) return;
                try {
                    games.push(JSON.parse(payload));
                } catch (_) {}
            });
        return games;
    }

    async function syncCustomGamesToUser() {
        const saved = await saveCustomGamesForUser(getCustomGamesFromDom());
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

        let game;
        try {
            game = JSON.parse(payload);
        } catch (_) {
            return;
        }

        editingCustomGameId = card.dataset.customGameId || '';
        addGamePanel.style.display = 'block';
        addGameName.value = game.name || '';
        addGameType.value = game.type === 'html'
            ? 'html'
            : game.type === 'file'
                ? 'file'
                : 'url';
        addGameType.dispatchEvent(new Event('change'));
        addGameUrl.value = game.url || '';
        addGameHtml.value = game.html || '';
        if (addGameUnblock) addGameUnblock.checked = game.unblock !== false;
        addGameFile.value = '';
        addGameIcon.value = '';
        addGameForm.dataset.existingFileData = game.fileData || '';
        addGameForm.dataset.existingFileName = game.fileName || '';
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
                    Authorization: `Bearer ${token}`
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
                    Authorization: `Bearer ${token}`
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
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) return;
            const data = await response.json();
            const customGames = Array.isArray(data.games) ? data.games : [];

            customGames.forEach((game) => {
                if (!game.customId) {
                    game.customId = `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                }

                const duplicate = gamesLinksContainer.querySelector(
                    `[data-public-custom-game="1"][data-custom-game-id="${game.customId}"]`
                );
                if (duplicate) duplicate.remove();
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
        if (addGameFileWrap) addGameFileWrap.style.display = 'none';
        if (addGameUnblock) addGameUnblock.checked = true;
        delete addGameForm.dataset.existingFileData;
        delete addGameForm.dataset.existingFileName;
        editingCustomGameId = '';
        if (addGameSubmitBtn) addGameSubmitBtn.textContent = 'Save Game';
    }

    addGameType.addEventListener('change', () => {
        const type = addGameType.value;
        addGameUrlWrap.style.display = type === 'url' ? 'block' : 'none';
        addGameHtmlWrap.style.display = type === 'html' ? 'block' : 'none';
        if (addGameFileWrap) {
            addGameFileWrap.style.display = type === 'file' ? 'block' : 'none';
        }
    });

    addGameBtn.addEventListener('click', () => {
        addGamePanel.style.display = 'block';
        addGameName.focus();
    });

    cancelAddGameBtn.addEventListener('click', () => {
        addGamePanel.style.display = 'none';
        resetAddGameForm();
    });

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not read the file.'));
            reader.readAsDataURL(file);
        });
    }

    addGameForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const type = addGameType.value;
        const name = addGameName.value.trim();
        if (!name) {
            alert('Please type a game name.');
            return;
        }

        let iconDataUrl = '/images/games.png';
        const iconFile = addGameIcon.files && addGameIcon.files[0];

        if (iconFile) {
            try {
                iconDataUrl = await readFileAsDataUrl(iconFile);
            } catch (_) {
                alert('Could not read the icon image.');
                return;
            }
        } else if (editingCustomGameId) {
            const existingCard = gamesLinksContainer.querySelector(
                `[data-owned-custom-game="1"][data-custom-game-id="${editingCustomGameId}"]`
            );
            try {
                const previous = JSON.parse(existingCard?.dataset.customGamePayload || '{}');
                iconDataUrl = previous.icon || '/images/games.png';
            } catch (_) {}
        }

        const game = {
            name,
            type,
            icon: iconDataUrl,
            unblock: addGameUnblock ? addGameUnblock.checked : true
        };

        if (type === 'html') {
            const html = addGameHtml.value.trim();
            if (!html) {
                alert('Please paste HTML code or upload an HTML file.');
                return;
            }
            game.html = html;
        } else if (type === 'file') {
            const selectedFile = addGameFile.files && addGameFile.files[0];
            if (selectedFile) {
                if (selectedFile.size > 10 * 1024 * 1024) {
                    alert('Files must be 10 MB or smaller.');
                    return;
                }

                try {
                    game.fileData = await readFileAsDataUrl(selectedFile);
                    game.fileName = selectedFile.name;
                } catch (_) {
                    alert('Could not read the selected game file.');
                    return;
                }
            } else {
                game.fileData = addGameForm.dataset.existingFileData || '';
                game.fileName = addGameForm.dataset.existingFileName || '';
            }

            if (!game.fileData || !game.fileName) {
                alert('Choose a file to upload.');
                return;
            }
        } else {
            const url = normalizeUrlInput(addGameUrl.value);
            if (!url) {
                alert('Please type a URL.');
                return;
            }
            game.url = url;
        }

        if (editingCustomGameId) {
            const existingCard = gamesLinksContainer.querySelector(
                `[data-owned-custom-game="1"][data-custom-game-id="${editingCustomGameId}"]`
            );
            game.customId = editingCustomGameId;

            if (existingCard) {
                try {
                    const previousGame = JSON.parse(
                        existingCard.dataset.customGamePayload || '{}'
                    );
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

                const freshCard = createCustomGameCard(game, { owned: true });
                existingCard.remove();
                freshCard.dataset.customGameId = game.customId;
                freshCard.dataset.customGamePayload = JSON.stringify(game);
            }
        } else {
            game.customId = `cg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const card = createCustomGameCard(game, { owned: true });
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
        homeContent.style.display = 'none';
        gamesContent.style.display = 'none';
        if (messagesContent) messagesContent.style.display = 'none';
        proxyContent.style.display = 'none';
        adminDashboard.style.display = 'none';
        contentFrame.style.display = 'block';
        contentFrame.srcdoc = '';
        proxyIframe.src = 'about:blank';
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
        contentFrame.style.display = 'block';
        contentFrame.removeAttribute('srcdoc');
        contentFrame.src = normalizeEmbeddedRoute(url);
    };

    window.loadGameHtml = function (htmlCode) {
        hideAllSections();
        activateEmbeddedFrame(contentFrame);
        contentFrame.style.display = 'block';
        contentFrame.src = 'about:blank';
        contentFrame.srcdoc = htmlCode;
    };

    window.showGames = function () {
        hideAllSections();
        gamesContent.style.display = 'block';
        contentFrame.src = '';
    };

    window.showProxy = function () {
        hideAllSections();
        activateEmbeddedFrame(proxyIframe);
        proxyContent.style.display = 'block';
        proxyIframe.src = '/p';
    };

    window.showAdmin = function () {
        if (!isCurrentUserAdmin()) return;
        hideAllSections();
        adminDashboard.style.display = 'block';
        settingsMenu.style.display = 'none';
        loadAdminData();
        loadAdminCustomGames();
        refreshShortcutSetting();
    };

    document.getElementById('adminSearchBar').addEventListener('input', renderAdminTable);

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
                    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1200);
                } catch (_) {
                    copyButton.textContent = 'Failed';
                    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1200);
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

        if (!foundCode && !parent.children.length) parent.textContent = text;
    }

    function renderAiMessageContent(message, text, allowCodeBubbles = false) {
        message.innerHTML = '';
        if (allowCodeBubbles) appendAiTextWithCode(message, text);
        else message.textContent = text;
    }

    function appendAiMessage(role, text, extraClass = '', allowCodeBubbles = false) {
        const message = document.createElement('div');
        message.className =
            `aiChatMessage ${role === 'user' ? 'userMessage' : 'aiMessage'} ${extraClass}`.trim();
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
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ messages: aiConversation.slice(-12) })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'Unbreaking AI could not answer right now.');
            }

            const answer = data.reply || 'I did not get a response.';
            renderAiMessageContent(typingMessage, answer, true);
            aiConversation.push({ role: 'assistant', content: answer });
            while (aiConversation.length > 12) aiConversation.shift();
        } catch (error) {
            typingMessage.textContent =
                error.message || 'Unbreaking AI had a problem answering.';
            typingMessage.classList.add('aiErrorMessage');
        } finally {
            setAiLoading(false);
            aiChatInput.focus();
            aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        }
    });

    userMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const btnRect = userMenuBtn.getBoundingClientRect();
        userDropdown.style.top = `${btnRect.top}px`;
        userDropdown.style.left =
            'calc(var(--sidebar-width) + var(--sidebar-margin-left) + 10px)';
        userDropdown.style.display =
            userDropdown.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', (event) => {
        if (!userMenuWrap.contains(event.target) && !userDropdown.contains(event.target)) {
            userDropdown.style.display = 'none';
        }
    });

    settingsIcon.onclick = function (event) {
        event.stopPropagation();
        const isOpening = settingsMenu.style.display !== 'block';
        settingsMenu.style.display = isOpening ? 'block' : 'none';
        if (!isOpening) return;

        const iconRect = settingsIcon.getBoundingClientRect();
        const menuHeight = settingsMenu.offsetHeight;
        settingsMenu.style.top = `${Math.max(10, iconRect.bottom - menuHeight)}px`;
        settingsMenu.style.left =
            'calc(var(--sidebar-width) + var(--sidebar-margin-left) + 10px)';
    };

    document.addEventListener('click', (event) => {
        if (!settingsMenu.contains(event.target) && event.target !== settingsIcon) {
            settingsMenu.style.display = 'none';
        }
    });

    let savedExtra = { glowColor: '#9b59b6', fullscreen: false };
    try {
        savedExtra = {
            ...savedExtra,
            ...(JSON.parse(localStorage.getItem('sspExtraSettings')) || {})
        };
    } catch (_) {}

    const saved = getSavedUiSettings();
    const toggleGlow = document.getElementById('toggleGlow');
    const toggleClock = document.getElementById('toggleClock');
    const toggleAi = document.getElementById('toggleAi');
    const toggleMusic = document.getElementById('toggleMusic');
    const musicTrackSelect = document.getElementById('musicTrackSelect');

    toggleGlow.checked = saved.glow;
    toggleClock.checked = saved.clock;
    toggleAi.checked = saved.ai !== false;
    toggleMusic.checked = saved.musicOn !== false;

    function applySettings(settings) {
        settings.glow
            ? document.body.classList.remove('noGlow')
            : document.body.classList.add('noGlow');
        clock.style.display = settings.clock ? 'block' : 'none';
        updateAiChatVisibility();

        if (bgAudio) {
            if (settings.musicTrack) {
                bgAudio.src = `/music/${encodeURIComponent(settings.musicTrack)}`;
            }
            if (settings.musicOn === false) bgAudio.pause();
            else bgAudio.play().catch(() => {});
        }
    }

    function saveSettings() {
        const settings = {
            glow: toggleGlow.checked,
            clock: toggleClock.checked,
            ai: toggleAi.checked,
            musicOn: toggleMusic.checked,
            musicTrack: musicTrackSelect.value
        };
        localStorage.setItem('sspSettings', JSON.stringify(settings));
        applySettings(settings);
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

    function applyExtraSettings(settings) {
        document.documentElement.style.setProperty('--glow-color', settings.glowColor);
        glowColorInput.value = settings.glowColor;
        toggleFullscreen.checked = settings.fullscreen;
        if (settings.fullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        updateGlowColorRgb();
    }

    function saveExtraSettings() {
        const settings = {
            glowColor: glowColorInput.value,
            fullscreen: toggleFullscreen.checked
        };
        localStorage.setItem('sspExtraSettings', JSON.stringify(settings));
        applyExtraSettings(settings);
    }

    glowColorInput.onchange = saveExtraSettings;
    toggleFullscreen.onchange = () => {
        if (toggleFullscreen.checked) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
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

    if (toggleShortcutButton) {
        toggleShortcutButton.classList.add('adminActionBtn');
        toggleShortcutButton.addEventListener('click', toggleShortcutSetting);
    }

    window.addEventListener('contextmenu', (event) => event.preventDefault());

    titleHeader.onclick = () => {
        hideAllSections();
        homeContent.style.display = 'flex';
        contentFrame.src = '';
        requestAnimationFrame(() => homeSearchInput.focus());
    };

    function setupSearch(searchInputId, containerId) {
        const searchBar = document.getElementById(searchInputId);
        const container = document.getElementById(containerId);
        searchBar.addEventListener('input', () => {
            const searchText = searchBar.value.toLowerCase();
            container.querySelectorAll('.gameCard').forEach((card) => {
                const title = card.querySelector('.gameTitle')?.textContent?.toLowerCase() || '';
                card.style.display = title.includes(searchText) ? 'flex' : 'none';
            });
        });
    }
    setupSearch('gamesSearchBar', 'gamesLinksContainer');

    homeSearchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        let typed = homeSearchInput.value.trim();
        if (!typed) return;

        const hasScheme = /^https?:\/\//i.test(typed);
        const looksLikeDomain = /^[^\s/]+\.[^\s]+/.test(typed);
        if (!hasScheme && looksLikeDomain) typed = `https://${typed}`;

        const target = `/p/search/${encodeURIComponent(typed)}?showbar`;
        hideAllSections();
        activateEmbeddedFrame(proxyIframe);
        proxyContent.style.display = 'block';
        proxyIframe.src = target;
    });

    window.runTool = function (type) {
        switch (type) {
            case 'autoclicker':
                fetch('https://cdn.jsdelivr.net/gh/wea-f/Norepted@a4cd53b/bookmarklets/autoclicker.js')
                    .then((response) => response.text())
                    .then((code) => (0, eval)(code));
                break;
            case 'asteroids': {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/gh/skysthelimitt/Selenite/js/asteroids.min.js';
                document.body.appendChild(script);
                break;
            }
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

    let particles = [];
    let sparkles = [];
    const maxParticles = 300;
    const maxSparkles = 50;
    const mouse = { x: canvas.width / 2, y: canvas.height / 2 };

    window.addEventListener('mousemove', (event) => {
        mouse.x = event.clientX;
        mouse.y = event.clientY;
    });

    function spawnParticle() {
        const edge = Math.floor(Math.random() * 4);
        let x;
        let y;

        switch (edge) {
            case 0: x = Math.random() * canvas.width; y = 0; break;
            case 1: x = canvas.width; y = Math.random() * canvas.height; break;
            case 2: x = Math.random() * canvas.width; y = canvas.height; break;
            default: x = 0; y = Math.random() * canvas.height; break;
        }

        particles.push({
            x,
            y,
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
        for (let index = 0; index < 5; index++) {
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
    canvas.addEventListener('mousemove', (event) => {
        if (event.buttons) addClickParticles();
    });

    function animate() {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        particles.forEach((particle, index) => {
            const dx = mouse.x - particle.x;
            const dy = mouse.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 3) {
                particle.x += dx * 0.03;
                particle.y += dy * 0.03;
                particle.angle += 0.1;

                ctx.save();
                ctx.translate(particle.x, particle.y);
                ctx.rotate(particle.angle);
                ctx.fillStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--glow-color')
                    .trim();
                ctx.globalAlpha = particle.opacity;
                ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
                ctx.restore();
            } else {
                particles.splice(index, 1);
            }
        });

        sparkles.forEach((sparkle, index) => {
            sparkle.opacity -= 0.01;
            if (sparkle.opacity <= 0) {
                sparkles.splice(index, 1);
                return;
            }
            ctx.fillStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--glow-color')
                .trim();
            ctx.globalAlpha = sparkle.opacity;
            ctx.fillRect(sparkle.x, sparkle.y, sparkle.size, sparkle.size);
        });

        spawnParticle();
        spawnSparkles();
        requestAnimationFrame(animate);
    }
    animate();

    window.fullscreenFrame = function () {
        const frame = document.getElementById('contentFrame');
        const proxy = document.getElementById('proxyIframe');
        const proxyWrap = document.getElementById('proxyContent');
        const messages = document.getElementById('messagesContent');

        let active = null;
        if (frame.classList.contains('is-frame-active')) active = frame;
        else if (proxy.classList.contains('is-frame-active') || proxyWrap.style.display === 'block') active = proxy;
        else if (messages?.style.display === 'block') active = document.documentElement;

        if (!active) return;

        if (!document.fullscreenElement) {
            active.requestFullscreen().catch((error) => console.error('Fullscreen failed:', error));
        } else {
            document.exitFullscreen().catch((error) => console.error('Exit fullscreen failed:', error));
        }
    };

    window.refreshFrame = function () {
        const frame = document.getElementById('contentFrame');
        const proxy = document.getElementById('proxyIframe');

        if (frame.classList.contains('is-frame-active')) {
            frame.src = frame.src;
        } else if (
            proxy.classList.contains('is-frame-active') ||
            document.getElementById('proxyContent').style.display === 'block'
        ) {
            proxy.src = proxy.src;
        } else if (messagesContent?.style.display === 'block') {
            loadMessages();
        }
    };

    const audio = document.getElementById('bgAudio');

    function tryPlay() {
        if (audio) audio.play().catch(() => {});
    }

    window.addEventListener('load', tryPlay);
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('keydown', tryPlay, { once: true });
})();
