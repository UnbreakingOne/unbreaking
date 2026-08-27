"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const backBtn = document.getElementById("sj-back");
const forwardBtn = document.getElementById("sj-forward");
const reloadBtn = document.getElementById("sj-reload");
const fullscreenBtn = document.getElementById("sj-fullscreen");
const bookmarkletBtn = document.getElementById("sj-bookmarklet");
const inspectBtn = document.getElementById("sj-inspect");
const landing = document.getElementById("landing");
const browserShell = document.getElementById("browser-shell");
const viewHost = document.getElementById("sj-view-host");
const tabstrip = document.getElementById("sj-tabstrip");
const newTabBtn = document.getElementById("sj-new-tab");
const homeForm = document.getElementById("sj-home-form");
const homeSearchInput = document.getElementById("sj-home-search");

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});
scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
const AUTOCLICKER_URL =
	"https://cdn.jsdelivr.net/gh/wea-f/Norepted@a4cd53b/bookmarklets/autoclicker.js";
const ERUDA_URL = "https://cdn.jsdelivr.net/npm/eruda";
const DEFAULT_FAVICON = "/tempest.png";
const SCRAMJET_ERROR_RETRIES = 2;
const SCRAMJET_ERROR_TEXT = "There was an error loading";

const tabs = [];
let activeTabId = null;
let urlSyncTimer = 0;

/** Turn scramjet frame URL into the real site URL for the bar (e.g. https://copter.io). */
function toPrettyUrl(proxyHref) {
	if (!proxyHref) return "";
	const s = String(proxyHref);
	try {
		const u = new URL(s);
		if (u.origin !== window.location.origin) return s;

		const prefix = "/scramjet/";
		if (!u.pathname.startsWith(prefix)) return s;

		const tail = u.pathname.slice(prefix.length);
		if (!tail) return s;

		let decoded = "";
		try {
			decoded = decodeURIComponent(tail);
		} catch {
			return s;
		}

		if (/^https?:\/\//i.test(decoded)) return decoded;
		if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(decoded)) return `https://${decoded}`;
		return decoded || s;
	} catch {
		return s;
	}
}

/** https://example.com/ → https://example.com when it's only root path. */
function normalizeDisplayUrl(u) {
	if (!u) return u;
	try {
		const x = new URL(u);
		if (x.pathname === "/" && !x.search && !x.hash) {
			return `${x.protocol}//${x.host}`;
		}
	} catch {
		// ignore
	}
	return u;
}

function prettyFromAny(href) {
	return normalizeDisplayUrl(toPrettyUrl(href));
}

function faviconUrlForPage(url, displayUrl) {
	const u = String(url || displayUrl || "").trim();
	if (!u || u === "about:blank") return DEFAULT_FAVICON;
	try {
		const parsed = new URL(u);
		if (!parsed.hostname) return DEFAULT_FAVICON;
		return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=32`;
	} catch {
		return DEFAULT_FAVICON;
	}
}

function clearErrors() {
	error.textContent = "";
	errorCode.textContent = "";
}

function showError(message, code = "") {
	error.textContent = message;
	errorCode.textContent = code;
}

function currentTab() {
	return tabs.find((t) => t.id === activeTabId) ?? null;
}

function parseStartupInput() {
	let pathname = decodeURIComponent(location.pathname).replace(/^\/+/, "");
	if (!pathname) return "";
	if (pathname.toLowerCase().startsWith("p/search/")) {
		pathname = pathname.slice("p/".length);
	}
	if (!pathname.toLowerCase().startsWith("search/")) return "";
	return pathname.slice("search/".length).trim();
}

function shouldShowStartupBar() {
	return new URLSearchParams(location.search).has("showbar");
}

function labelFromUrl(url) {
	if (!url) return "Tempest";
	try {
		return new URL(url).hostname || url;
	} catch {
		return url;
	}
}

function updateTabButton(tab) {
	const titleNode = tab.button.querySelector(".tab-title");
	const favNode = tab.button.querySelector(".tab-favicon");
	if (titleNode) titleNode.textContent = tab.title;
	if (favNode) {
		const src = tab.faviconUrl || faviconUrlForPage(tab.displayUrl || tab.currentUrl, tab.displayUrl);
		if (favNode.getAttribute("src") !== src) favNode.setAttribute("src", src);
	}
	tab.button.classList.toggle("active", tab.id === activeTabId);
	tab.button.setAttribute("aria-selected", tab.id === activeTabId ? "true" : "false");
}

function updateNavState() {
	const tab = currentTab();
	if (!tab) {
		backBtn.disabled = true;
		forwardBtn.disabled = true;
		reloadBtn.disabled = true;
		address.value = "";
		return;
	}
	backBtn.disabled = tab.historyIndex <= 0;
	forwardBtn.disabled = tab.historyIndex >= tab.historyStack.length - 1;
	reloadBtn.disabled = !tab.currentUrl;
	address.value = tab.displayUrl || tab.currentUrl || "";
}

function isScramjetErrorDocument(frameDocument) {
	const text = frameDocument?.body?.innerText || "";
	return text.includes("Uh oh!") && text.includes(SCRAMJET_ERROR_TEXT);
}

function setLandingVisible(visible) {
	landing.classList.toggle("active", visible);
	landing.setAttribute("aria-hidden", visible ? "false" : "true");
}

function activateTab(tabId) {
	activeTabId = tabId;
	for (const tab of tabs) {
		tab.frame.frame.classList.toggle(
			"active",
			tab.id === activeTabId && Boolean(tab.currentUrl || tab.frame.frame.srcdoc)
		);
		updateTabButton(tab);
	}
	const active = currentTab();
	setLandingVisible(!active || !(active.currentUrl || active.frame.frame.srcdoc));
	updateNavState();
	startUrlSyncInterval();
}

function removeTab(tabId) {
	const index = tabs.findIndex((tab) => tab.id === tabId);
	if (index === -1) return;

	const [tab] = tabs.splice(index, 1);
	tab.frame.frame.remove();
	tab.button.remove();

	if (!tabs.length) {
		createTab();
		return;
	}

	if (activeTabId === tabId) {
		const nextTab = tabs[Math.max(0, index - 1)] ?? tabs[0];
		activateTab(nextTab.id);
	} else {
		updateNavState();
	}
}

function createTabButton(tab) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "tab";
	button.setAttribute("role", "tab");
	button.innerHTML =
		`<img class="tab-favicon" alt="" width="16" height="16" decoding="async" />` +
		`<span class="tab-title"></span>` +
		`<span class="tab-close" aria-label="Close tab">✕</span>`;

	button.addEventListener("click", (event) => {
		const closeBtn =
			event.target instanceof Element ? event.target.closest(".tab-close") : null;
		if (closeBtn) {
			event.stopPropagation();
			removeTab(tab.id);
			return;
		}
		activateTab(tab.id);
	});

	tabstrip.appendChild(button);
	return button;
}

function resolveUrlWithBase(rawUrl, baseUrl = "") {
	if (!rawUrl) return "about:blank";
	const t = String(rawUrl).trim();
	if (!t) return "about:blank";
	if (t === "about:blank") return t;
	try {
		return baseUrl ? new URL(t, baseUrl).href : new URL(t).href;
	} catch {
		return t;
	}
}

async function ensureTransportReady() {
	const wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
	}
}

function tryFaviconFromFrameDocument(tab, frameDocument) {
	try {
		const links = frameDocument.querySelectorAll(
			'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
		);
		for (const link of links) {
			const href = link.getAttribute("href");
			if (!href) continue;
			const abs = resolveUrlWithBase(href, tab.displayUrl || tab.currentUrl || undefined);
			if (abs && abs !== "about:blank") {
				tab.faviconUrl = abs;
				return;
			}
		}
	} catch {
		// ignore
	}
	tab.faviconUrl = faviconUrlForPage(tab.displayUrl || tab.currentUrl, tab.displayUrl);
}

function syncTabLocationFromFrame(tab) {
	const frameEl = tab.frame.frame;
	if (!frameEl || frameEl.hasAttribute("srcdoc")) return;

	try {
		const rawHref = frameEl.contentWindow?.location?.href;
		if (!rawHref) return;

		const pretty = prettyFromAny(rawHref);
		const prevPretty = tab.displayUrl || tab.currentUrl || "";

		if (pretty === prevPretty) return;

		tab.currentUrl = pretty;
		tab.displayUrl = pretty;
		tab.faviconUrl = faviconUrlForPage(pretty, pretty);

		try {
			tryFaviconFromFrameDocument(tab, frameEl.contentWindow.document);
		} catch {
			// ignore
		}

		try {
			const frameDoc = frameEl.contentWindow?.document;
			if (frameDoc?.title && frameDoc.title.trim()) {
				tab.title = frameDoc.title.trim();
			} else {
				tab.title = labelFromUrl(pretty);
			}
		} catch {
			tab.title = labelFromUrl(pretty);
		}

		if (tab.id === activeTabId) {
			address.value = pretty;
		}

		if (tab.historyIndex >= 0) {
			tab.historyStack[tab.historyIndex] = pretty;
			tab.displayHistoryStack[tab.historyIndex] = pretty;
		} else if (tab.historyStack.length === 0 && pretty) {
			tab.historyStack.push(pretty);
			tab.displayHistoryStack.push(pretty);
			tab.historyIndex = 0;
		}

		updateTabButton(tab);
		updateNavState();
	} catch {
		// cross-origin / opaque
	}
}

function startUrlSyncInterval() {
	if (urlSyncTimer) {
		clearInterval(urlSyncTimer);
		urlSyncTimer = 0;
	}
	urlSyncTimer = window.setInterval(() => {
		const tab = currentTab();
		if (!tab?.currentUrl || tab.frame.frame.hasAttribute("srcdoc")) return;
		syncTabLocationFromFrame(tab);
	}, 400);
}

function bindFrameTitleUpdates(tab) {
	const frameEl = tab.frame.frame;
	frameEl.addEventListener("load", async () => {
		tab.erudaVisible = false;

		let frameDoc = null;
		try {
			frameDoc = frameEl.contentWindow?.document || null;
		} catch {
			frameDoc = null;
		}

		if (frameDoc && isScramjetErrorDocument(frameDoc) && tab.lastDestination) {
			tab.errorRetryCount += 1;
			try {
				await ensureTransportReady();
			} catch {
				// Keep the Scramjet error page hidden while the retry is scheduled.
			}

			const retryDelay = tab.errorRetryCount <= SCRAMJET_ERROR_RETRIES ? 600 : 1800;
			window.setTimeout(() => tab.frame.go(tab.lastDestination), retryDelay);
			return;
		}

		syncTabLocationFromFrame(tab);
		try {
			if (frameDoc?.title && frameDoc.title.trim()) {
				tab.title = frameDoc.title.trim();
			} else {
				tab.title = labelFromUrl(tab.displayUrl || tab.currentUrl);
			}
			tryFaviconFromFrameDocument(tab, frameDoc);
		} catch {
			tab.title = labelFromUrl(tab.displayUrl || tab.currentUrl);
			tab.faviconUrl = faviconUrlForPage(tab.displayUrl || tab.currentUrl, tab.displayUrl);
		}
		updateTabButton(tab);
		if (tab.id === activeTabId) updateNavState();
	});
}

async function navigate(
	inputValue,
	pushHistory = true,
	explicitTab = null,
	options = {}
) {
	if (!String(inputValue || "").trim()) return;
	const tab = explicitTab ?? currentTab();
	if (!tab) return;

	clearErrors();

	try {
		await registerSW();
		await ensureTransportReady();
	} catch (err) {
		showError("Failed to initialize Scramjet service worker/transport.", String(err));
		return;
	}

	const destination = search(String(inputValue), searchEngine.value);
	const prettyDest = /^https?:\/\//i.test(destination)
		? normalizeDisplayUrl(destination)
		: destination;

	tab.currentUrl = prettyDest;
	tab.displayUrl = options.displayUrl || prettyDest;
	tab.title = labelFromUrl(tab.displayUrl);
	tab.faviconUrl = faviconUrlForPage(prettyDest, tab.displayUrl);
	tab.erudaVisible = false;
	tab.lastDestination = destination;
	tab.errorRetryCount = 0;
	inspectBtn.classList.remove("inspect-active");

	if (tab.frame.frame.hasAttribute("srcdoc")) {
		tab.frame.frame.removeAttribute("srcdoc");
	}

	tab.frame.go(destination);

	if (pushHistory) {
		tab.historyStack.splice(tab.historyIndex + 1);
		tab.historyStack.push(tab.displayUrl);
		tab.displayHistoryStack.splice(tab.historyIndex + 1);
		tab.displayHistoryStack.push(tab.displayUrl);
		tab.historyIndex = tab.historyStack.length - 1;
	}

	browserShell.classList.add("is-browsing");
	updateTabButton(tab);
	if (tab.id === activeTabId) activateTab(tab.id);
	updateNavState();
}

async function openProxyTab(rawUrl, baseUrl = "", displayUrl = "") {
	const resolved = resolveUrlWithBase(rawUrl, baseUrl);
	const tab = createTab("", true);
	if (resolved && resolved !== "about:blank") {
		const disp = displayUrl ? prettyFromAny(displayUrl) : normalizeDisplayUrl(resolved);
		await navigate(resolved, true, tab, { displayUrl: disp });
	} else {
		tab.currentUrl = "about:blank";
		tab.displayUrl = "about:blank";
		tab.title = "about:blank";
		tab.faviconUrl = DEFAULT_FAVICON;
		tab.erudaVisible = false;
		updateTabButton(tab);
		updateNavState();
	}
	return tab;
}

function createTab(startUrl = "", activate = true) {
	const tab = {
		id: `tab-${crypto.randomUUID()}`,
		title: "Tempest",
		currentUrl: "",
		displayUrl: "",
		faviconUrl: DEFAULT_FAVICON,
		erudaVisible: false,
		historyStack: [],
		displayHistoryStack: [],
		historyIndex: -1,
		lastDestination: "",
		errorRetryCount: 0,
		frame: scramjet.createFrame(),
		button: null,
	};

	tab.frame.frame.classList.add("tab-frame");
	viewHost.appendChild(tab.frame.frame);
	tab.button = createTabButton(tab);
	bindFrameTitleUpdates(tab);
	tabs.push(tab);
	updateTabButton(tab);

	if (activate) activateTab(tab.id);
	if (startUrl) navigate(startUrl, true, tab);

	return tab;
}

async function getActiveFrameContext() {
	const tab = currentTab();
	if (!tab || !tab.currentUrl) throw new Error("Open a proxied page first.");
	const frameWindow = tab.frame.frame.contentWindow;
	const frameDocument = frameWindow?.document;
	if (!frameWindow || !frameDocument) throw new Error("Proxy frame not ready.");
	return { frameWindow, frameDocument, tab };
}

function teardownErudaInFrame(frameWindow) {
	try {
		if (frameWindow.eruda && typeof frameWindow.eruda.destroy === "function") {
			frameWindow.eruda.destroy();
		}
	} catch (_) {}
	try {
		delete frameWindow.eruda;
	} catch (_) {}
}

async function injectAutoclickerIntoCurrentTab() {
	try {
		clearErrors();
		bookmarkletBtn.disabled = true;

		const { frameDocument } = await getActiveFrameContext();
		const res = await fetch(AUTOCLICKER_URL, { cache: "no-store" });
		if (!res.ok) throw new Error(`Script fetch failed: ${res.status}`);
		const code = await res.text();

		const scriptEl = frameDocument.createElement("script");
		scriptEl.textContent = `${code}\n//# sourceURL=autoclicker.js`;
		(frameDocument.head || frameDocument.documentElement).appendChild(scriptEl);
		scriptEl.remove();
		showError("Autoclicker injected.");
	} catch (err) {
		showError("Failed to inject autoclicker.", String(err));
	} finally {
		bookmarkletBtn.disabled = false;
	}
}

async function injectInspectIntoCurrentTab() {
	try {
		clearErrors();
		inspectBtn.disabled = true;

		const { frameWindow, frameDocument, tab } = await getActiveFrameContext();

		if (frameWindow.eruda) {
			if (tab.erudaVisible) {
				try {
					if (typeof frameWindow.eruda.hide === "function") {
						frameWindow.eruda.hide();
					}
				} catch (_) {}
				tab.erudaVisible = false;
				inspectBtn.classList.remove("inspect-active");
				showError("Inspector hidden.");
				return;
			}
			try {
				if (typeof frameWindow.eruda.show === "function") {
					frameWindow.eruda.show();
				}
			} catch (_) {
				teardownErudaInFrame(frameWindow);
				tab.erudaVisible = false;
			}
			if (frameWindow.eruda) {
				tab.erudaVisible = true;
				inspectBtn.classList.add("inspect-active");
				showError("Inspector shown.");
				return;
			}
		}

		const res = await fetch(ERUDA_URL, { cache: "no-store" });
		if (!res.ok) throw new Error(`Eruda fetch failed: ${res.status}`);
		const erudaCode = await res.text();

		const scriptEl = frameDocument.createElement("script");
		scriptEl.textContent = `${erudaCode}\n//# sourceURL=eruda.bundle.js`;
		(frameDocument.head || frameDocument.documentElement).appendChild(scriptEl);
		scriptEl.remove();

		if (!frameWindow.eruda) {
			throw new Error("Eruda loaded but unavailable in frame.");
		}

		frameWindow.eruda.init({ useShadowDom: true });
		frameWindow.eruda.show();
		tab.erudaVisible = true;
		inspectBtn.classList.add("inspect-active");
		showError("Inspector opened.");
	} catch (err) {
		showError("Failed to open inspector.", String(err));
	} finally {
		inspectBtn.disabled = false;
	}
}

window.addEventListener("message", async (event) => {
	const data = event.data;
	if (!data || data.__tempestPopup !== true) return;

	const active = currentTab();
	const base = active?.displayUrl || active?.currentUrl || location.href;

	if (data.type === "navigate" && data.url) {
		await openProxyTab(data.url, base, data.displayUrl || "");
		return;
	}

	if (data.type === "srcdoc" && data.html) {
		const tab = createTab("", true);
		tab.currentUrl = "about:blank";
		tab.displayUrl = data.displayUrl || "about:blank";
		tab.title = "about:blank";
		tab.faviconUrl = DEFAULT_FAVICON;
		tab.erudaVisible = false;
		tab.frame.frame.srcdoc = String(data.html);
		updateTabButton(tab);
		updateNavState();
	}
});

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	await navigate(address.value, true);
});

homeForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	address.value = homeSearchInput.value;
	await navigate(homeSearchInput.value, true);
});

newTabBtn.addEventListener("click", () => {
	createTab("", true);
	clearErrors();
});

bookmarkletBtn.addEventListener("click", () => {
	injectAutoclickerIntoCurrentTab();
});

inspectBtn.addEventListener("click", () => {
	injectInspectIntoCurrentTab();
});

backBtn.addEventListener("click", async () => {
	const tab = currentTab();
	if (!tab || tab.historyIndex <= 0) return;
	tab.historyIndex -= 1;
	const dest = tab.historyStack[tab.historyIndex];
	const disp = tab.displayHistoryStack[tab.historyIndex] || dest;
	await navigate(dest, false, tab, { displayUrl: disp });
});

forwardBtn.addEventListener("click", async () => {
	const tab = currentTab();
	if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return;
	tab.historyIndex += 1;
	const dest = tab.historyStack[tab.historyIndex];
	const disp = tab.displayHistoryStack[tab.historyIndex] || dest;
	await navigate(dest, false, tab, { displayUrl: disp });
});

reloadBtn.addEventListener("click", () => {
	const tab = currentTab();
	if (tab?.currentUrl) {
		clearErrors();
		tab.errorRetryCount = 0;
		tab.frame.go(tab.lastDestination || tab.currentUrl);
	}
});

async function enterFullscreen(element) {
	if (!element) return;
	try {
		await element.requestFullscreen({ navigationUI: "hide" });
	} catch {
		await element.requestFullscreen();
	}
}

fullscreenBtn.addEventListener("click", async () => {
	if (!document.fullscreenElement) return enterFullscreen(browserShell);
	await document.exitFullscreen();
});

document.addEventListener(
	"click",
	(event) => {
		const anchor =
			event.target instanceof Element
				? event.target.closest("a[target='_blank']")
				: null;
		if (!anchor) return;
		const href = anchor.getAttribute("href");
		if (!href) return;
		event.preventDefault();
		openProxyTab(href, currentTab()?.displayUrl || currentTab()?.currentUrl || location.href);
	},
	true
);

const startupInput = parseStartupInput();
if (startupInput) {
	if (!shouldShowStartupBar()) browserShell.classList.add("startup-direct");
}

createTab();
activateTab(tabs[0].id);
updateNavState();
startUrlSyncInterval();

if (startupInput) {
	homeSearchInput.value = startupInput;
	address.value = /^https?:\/\//i.test(startupInput)
		? normalizeDisplayUrl(startupInput)
		: startupInput;
	navigate(startupInput, true);
}
