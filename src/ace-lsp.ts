import type Ace from "ace";

import type { LanguageProvider, MessageController } from "ace-linters";
import { AceLanguageClient } from "ace-linters/build/ace-language-client";
import { EXT_URL } from "./constants";
import JSZip from "jszip";

async function readZipFile(url: string) {
	try {
		const response = await fetch(url);
		const data = await response.arrayBuffer();
		const results: Record<string, string> = {};
		const zip = await JSZip.loadAsync(data);
		for (const [filename, file] of Object.entries(zip.files)) {
			if (file.dir) continue;
			results[`/typings/${filename}`] = await file.async("text");
		}
		return results;
	} catch (error) {
		console.error(error);
		return {};
	}
}

async function workerLanguageServer(url: string, name: string) {
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
	const languageProvider = AceLanguageClient.for({
		id: "python",
		module: () => import("ace-linters/build/language-client"),
		modes: "python",
		type: "webworker",
		worker: worker,
		initializationOptions: {
			files: await readZipFile(`${EXT_URL}/python-stdlib.zip`),
		}
	});
	// (async () => {
	// 	const messageController: MessageController = Reflect.get(languageProvider, '$messageController');
	// 	for await (const [name, content] of readZipFile(`${EXT_URL}/python-stdlib.zip`)) {
	// 		messageController.init({
	// 			documentUri: `/typings/${name}`,
	// 			sessionId: '',
	// 		}, {
	// 			getValue() {
	// 				return content;
	// 			},
	// 		} satisfies Partial<Ace.Ace.Document>, 'ace/mode/python', {}, () => { });
	// 	}
	// })();
	// languageProvider.setGlobalOptions("python", );
	return languageProvider;
}

// async function workerLanguageServer(url: string, name: string) {
// 	const data = await (await fetch(url)).blob();
// 	const blobUrl = URL.createObjectURL(data);
// 	const worker = new Worker(blobUrl, {
// 		type: 'module',
// 		name,
// 	});
// 	return LanguageProvider.create(worker);
// }

const languageServers: Partial<Record<'py', Promise<LanguageProvider>>> = {};

function onSetLanguage(mode: string | Ace.Ace.SyntaxMode, editor: Ace.Ace.Editor) {
	if (typeof mode !== 'string') return;
	if (mode.includes('py')) {
		languageServers.py ??= workerLanguageServer(`${EXT_URL}/pyright/pyright.worker.js`, "Pyright Language Server");
		languageServers.py.then(ls => ls.registerEditor(editor));
	}
}

export function patchAceEditor() {
	window.ace = {};
	let _internalEdit: typeof Ace.edit | null = null;
	Object.defineProperty(window.ace, 'edit', {
		get: (): typeof Ace.edit => (el, options) => {
			try {
				const editor = _internalEdit?.(el, {
					copyWithEmptySelection: true,
					...options,
				});
				if (!editor) throw new Error("Could not make ACE editor");
				if (options?.mode) onSetLanguage(options.mode, editor);
				const _setMode = editor.session.setMode;
				editor.session.setMode = function (mode, cb) {
					onSetLanguage(mode, editor);
					_setMode.call(this, mode, cb);
				};
				return editor;
			} catch (e) {
				console.error(e);
				throw e;
			}
		},
		set(v) {
			_internalEdit = v;
		}
	});
}
