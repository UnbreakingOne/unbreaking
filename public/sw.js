importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

function injectShim(html) {
	const source = String(html || "");
	if (source.includes("tempest-popup-shim.js")) return source;

	const tag = `<script src="/tempest-popup-shim.js"></script>`;
	if (/<head[^>]*>/i.test(source)) {
		return source.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
	}
	return `${tag}${source}`;
}

function removeMetaCsp(html) {
	return String(html || "").replace(
		/<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi,
		""
	);
}

async function handleRequest(event) {
	await scramjet.loadConfig();

	if (scramjet.route(event)) {
		const resp = await scramjet.fetch(event);
		const ct = resp.headers.get("content-type") || "";

		if (!/text\/html/i.test(ct)) return resp;

		const body = await resp.text();
		const patched = injectShim(removeMetaCsp(body));

		const headers = new Headers(resp.headers);
		headers.delete("content-length");
		headers.delete("content-security-policy");
		headers.delete("content-security-policy-report-only");
		headers.delete("x-frame-options");

		return new Response(patched, {
			status: resp.status,
			statusText: resp.statusText,
			headers
		});
	}

	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
