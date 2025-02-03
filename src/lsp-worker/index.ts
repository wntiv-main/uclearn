const _fetch = self.fetch;
self.fetch = async function (input, init) {
	let url = input;
	if (url instanceof Request) url = url.url;
	if (typeof url !== 'string') url = url.href;
	const match = url.match(/^data:(?<mime>[^;,]*)(?<b64>;base64)?,(?<data>.*)$/);
	if (match?.groups)
		return Uint8Array.from(match.groups?.b64 ? atob(match.groups.data) : decodeURIComponent(match.groups.data ?? ''),
			ch => ch.charCodeAt(0));
	return _fetch.call(this, input, init);
};

import { ServiceManager } from "ace-linters/build/service-manager";

const manager = new ServiceManager(self);
// https://github.com/mkslanc/ace-linters/blob/main/packages/demo/webworker-lsp/webworker.ts
// manager.registerService("python", {
// 	features: {
// 		completion: true,
// 		completionResolve: true,
// 		diagnostics: true,
// 		format: true,
// 		hover: true,
// 		documentHighlight: true,
// 		signatureHelp: true,
// 	},
// 	module: () => import("ace-python-ruff-linter/build/python-service"),
// 	className: "PythonService",
// 	modes: "python",
// });

async function workerLanguageServer(url: string | URL, name: string) {
	const data = await (await fetch(url)).blob();
	const blobUrl = URL.createObjectURL(data);
	const worker = new Worker(blobUrl, {
		type: 'module',
		name,
	});
	worker.postMessage({
		type: 'browser/boot',
		mode: 'foreground'
	});
	return worker;
}

(async () => {
	manager.registerServer("Pyright Language Server", {
		module: () => import("ace-linters/build/language-client"),
		type: 'webworker',
		worker: await workerLanguageServer(new URL('/pyright/pyright.worker.js', import.meta.url), "Pyright Language Server"),
		modes: "python",
	});
})();
