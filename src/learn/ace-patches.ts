import type Ace from "ace-code";

import type { LanguageProvider } from "ace-linters";
import { AceLanguageClient } from "ace-linters/build/ace-language-client";
import { EXT_URL } from "./constants";
import JSZip from "jszip";
import { getAce, initAce } from "./lib-hook";
import { onPostHydrate } from "./navigation";

// declare module 'ace-code' {
// 	const require: Require;
// 	const define: RequireDefine;
// }

async function readZipFile(base: string, url: string) {
	try {
		const response = await fetch(url);
		const data = await response.arrayBuffer();
		const results: Record<string, string> = {};
		const zip = await JSZip.loadAsync(data);
		for (const [filename, file] of Object.entries(zip.files)) {
			if (file.dir) continue;
			results[`${base}/${filename}`] = await file.async("text");
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
			rootPath: '/',
			files: await readZipFile('/__typeshed__', `${EXT_URL}/learn/python-typeshed.zip`),
		},
		options: {
			python: {
				analysis: {
					typeshedPaths: ['/__typeshed__'],
					include: ['/**/*'],
					exclude: ['/**/__pycache__', '/**/.*', '/__typeshed__', '/tmp'],
				},
			},
		},
		features: {
			codeAction: true,
			completion: true,
			completionResolve: true,
			diagnostics: true,
			documentHighlight: true,
			executeCommand: true,
			format: true,
			hover: true,
			semanticTokens: true,
			signatureHelp: true,
		},
	});
	return languageProvider;
}

const languageServers: Partial<Record<'py', Promise<LanguageProvider>>> = {};

function onSetLanguage(mode: string | Ace.Ace.SyntaxMode, editor: Ace.Ace.Editor) {
	if (typeof mode !== 'string') return;
	if (editor.getReadOnly()) return;
	if (mode.includes('py')) {
		languageServers.py ??= workerLanguageServer(`${EXT_URL}/learn/pyright/pyright.worker.js`, "Pyright Language Server");
		languageServers.py.then(ls => {
			ls.registerEditor(editor);
			editor.setOption('enableLiveAutocompletion', true);
		});
	}
}

export async function patchAceEditor() {
	const ace = await getAce();
	onPostHydrate(async () => {
		// TODO: only do if known ace editors on page
		window.aceInlineCodeHighlightingDone &&= false;
		window.aceInlineCodeInteractiveDone &&= false;
		(await initAce).initAceHighlighting({});
		(await initAce).initAceInteractive({ button_label: "Try it!" });
	});
	let _internalEdit = ace.edit;
	Object.defineProperty(ace, 'edit', {
		get: (): typeof Ace.edit => (el, options) => {
			try {
				const element = typeof el === 'string' ? document.getElementById(el) : el;
				if (!element) throw new Error("Expected an element");
				element.classList.add('__uclearn-code-editor-container');
				const root = element.attachShadow({
					mode: "open",
				});
				const style = document.createElement('link');
				style.rel = "stylesheet";
				style.href = `${EXT_URL}/learn/ace-code-shadow.css`;
				style.id = '__uclearn-ace-code-shadow';
				style.addEventListener("load", () =>
					setTimeout(() => editor.resize(), 0));
				const container = document.createElement("div");
				root.append(container, style);
				const editor = _internalEdit?.(container, {
					copyWithEmptySelection: true,
					scrollPastEnd: 0.5,
					enableBasicAutocompletion: false,
					...options,
				} satisfies Ace.Ace.EditorOptions);
				editor.renderer.attachToShadowRoot();
				if (!editor) throw new Error("Could not make ACE editor");
				if (options?.mode) onSetLanguage(options.mode, editor);
				const _setMode = editor.session.setMode;
				editor.session.setMode = function (mode, cb) {
					onSetLanguage(mode, editor);
					_setMode.call(this, mode, cb);
				};
				const _setReadOnly = editor.setReadOnly;
				editor.setReadOnly = function (readOnly) {
					onSetLanguage(editor.session.getMode(), editor);
					_setReadOnly.call(this, readOnly);
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
