const INJECT_URLS = ["*://learn.canterbury.ac.nz/*", "*://preuc.canterbury.ac.nz/*"];

function startSocket() {
	/** @type WebSocket */
	let ws;
	try {
		ws = new WebSocket('ws://localhost:4360');
	} catch(e) {
		console.warn(e);
		setTimeout(startSocket, 10e3);
	}

	ws.addEventListener("message", async (e) => {
		if(e.data === 'keep-alive') {
			console.log('keepalive');
			return;
		}
		console.log("[Hot Reloading]", e.data);
		const toastMessage =
			e.data === 'css-reload' ? ["CSS updated", { type: 'success' }]
				: e.data === 'manifest-reload' ? ["Extension manifest updated"]
					: ["Change detected in js - reload to update!", { type: 'warning' }];
		for(const tab of await chrome.tabs.query({ url: INJECT_URLS }))
			chrome.scripting.executeScript({
				func: (args) => window.require?.(['core/toast'], toast => toast.add(...args)),
				args: [toastMessage],
				injectImmediately: true,
				world: "MAIN",
				target: { tabId: tab.id },
			});
		switch(e.data) {
			case 'css-reload':
				for(const tab of await chrome.tabs.query({ url: INJECT_URLS }))
					chrome.scripting.executeScript({
						func: () => document.getElementById('__uclearn-css-inject').classList.add('__uclearn-refresh-css'),
						injectImmediately: true,
						target: { tabId: tab.id },
					});
				break;
			case 'full-reload':
			// chrome.tabs.reload(tab.id);
			case 'manifest-reload':
				break;
		}
		// DANGER: this invalidates all extension resources
		chrome.runtime.reload();
	});

	ws.addEventListener("close", (e) => {
		console.warn(e);
		setTimeout(startSocket, 10e3);
	});
}

chrome.runtime.onInstalled.addListener(async () => {
	startSocket();

	for(const tab of await chrome.tabs.query({ url: INJECT_URLS })) {
		await chrome.scripting.executeScript({
			files: ['dev-watcher-content-script.js'],
			injectImmediately: true,
			target: { tabId: tab.id },
		});
	}
});
