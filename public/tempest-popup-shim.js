(() => {
	if (window.__tempestPopupShimInstalled) return;
	window.__tempestPopupShimInstalled = true;

	/**
	 * When Tempest is embedded (e.g. site → iframe → Tempest → proxy frame → this page),
	 * `top` is the embedding site, not Tempest. Notify every ancestor up the chain
	 * so the Tempest shell (whichever level that is) receives the message.
	 */
	function send(payload) {
		const msg = { __tempestPopup: true, ...payload };
		let target = window;
		for (;;) {
			const parentWin = target.parent;
			if (parentWin === target) break;
			try {
				parentWin.postMessage(msg, "*");
			} catch (_) {}
			target = parentWin;
		}
	}

	function abs(raw, base) {
		try {
			return new URL(String(raw || ""), base || location.href).href;
		} catch {
			return String(raw || "");
		}
	}

	function firstIframeSrc(html) {
		const m = String(html || "").match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
		return m ? m[1] : "";
	}

	function fakePopup(baseUrl, openedUrl) {
		let closed = false;
		let opened = false;
		let buf = "";
		const openedAsBlank =
			String(openedUrl || "").trim().toLowerCase() === "about:blank";

		const nav = (u) => {
			if (closed || !u) return;
			send({
				type: "navigate",
				url: abs(u, baseUrl),
				displayUrl: openedAsBlank ? "about:blank" : undefined,
			});
		};

		const loc = {};
		Object.defineProperty(loc, "href", {
			get() {
				return openedAsBlank
					? "about:blank"
					: abs(openedUrl || "about:blank", baseUrl);
			},
			set(v) {
				nav(v);
			},
		});
		loc.assign = (v) => nav(v);
		loc.replace = (v) => nav(v);

		const doc = {
			open() {
				opened = true;
				buf = "";
			},
			write(chunk) {
				if (!opened) {
					opened = true;
					buf = "";
				}
				buf += String(chunk || "");
			},
			close() {
				const src = firstIframeSrc(buf);
				if (src) {
					send({
						type: "navigate",
						url: abs(src, baseUrl),
						displayUrl: openedAsBlank ? "about:blank" : undefined,
					});
					return;
				}
				send({
					type: "srcdoc",
					html: buf || "<!doctype html><title>Tempest</title>",
					displayUrl: openedAsBlank ? "about:blank" : undefined,
				});
			},
		};

		return {
			closed: false,
			close() {
				closed = true;
				this.closed = true;
			},
			focus() {},
			blur() {},
			postMessage() {},
			opener: window,
			location: loc,
			document: doc,
		};
	}

	const nativeOpen = window.open ? window.open.bind(window) : null;
	if (nativeOpen) {
		window.open = function (url = "", target = "_blank", features = "") {
			const t = String(target || "_blank").toLowerCase();
			if (t === "_blank" || t === "_new" || t === "") {
				const req = String(url || "").trim();
				if (req && req !== "about:blank") {
					send({ type: "navigate", url: abs(req, location.href) });
				}
				return fakePopup(location.href, req || "about:blank");
			}
			return nativeOpen(url, target, features);
		};
	}

	document.addEventListener(
		"click",
		(event) => {
			const a =
				event.target instanceof Element
					? event.target.closest("a[target='_blank']")
					: null;
			if (!a) return;
			const href = a.getAttribute("href");
			if (!href) return;
			event.preventDefault();
			send({ type: "navigate", url: abs(href, location.href) });
		},
		true
	);
})();
