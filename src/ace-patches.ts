import type Ace from "ace-code";
import type { FontMetrics as FontMetricsType } from "ace-code/src/layer/font_metrics";

import type { LanguageProvider } from "ace-linters";
import { AceLanguageClient } from "ace-linters/build/ace-language-client";
import { EXT_URL } from "./constants";
import JSZip from "jszip";
import { getAce } from "./lib-hook";

declare module 'ace-code' {
	const require: Require;
	const define: RequireDefine;
}

type BoxSize = { width: number, height: number; };

type AddListenerToEmit<T> = T extends (event: infer K extends string, callback: (...args: infer R extends unknown[]) => unknown) => unknown
	? (event: K, ...data: R) => void : never;

declare module "ace-code/src/layer/font_metrics" {// Expose required internals
	interface FontMetrics {
		$characterSize: {
			width: number;
			height: number;
		};
		$observer?: ResizeObserver;
		$measureNode?: Element;
		$setMeasureNodeStyles(style: CSSStyleDeclaration, isRoot?: boolean): void;
		$addObserver(): void;
		$pollSizeChanges(): ReturnType<typeof setTimeout>;
		$measureSizes(node: Element): BoxSize | null;
		$measureCharWidth(ch: string & { length: 1; }): number;
		$getZoom(element: Element): number;
		$initTransformMeasureNodes(): void;
		checkForSizeChanges(size?: BoxSize): void;
		_emit: AddListenerToEmit<FontMetricsType['on']>;
	}
}

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
			files: await readZipFile('/__typeshed__', `${EXT_URL}/python-typeshed.zip`),
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
		languageServers.py ??= workerLanguageServer(`${EXT_URL}/pyright/pyright.worker.js`, "Pyright Language Server");
		languageServers.py.then(ls => {
			ls.registerEditor(editor);
			editor.setOption('enableLiveAutocompletion', true);
		});
	}
}

export async function patchAceEditor() {
	const ace = await getAce();
	let _internalEdit = ace.edit;
	Object.defineProperty(ace, 'edit', {
		get: (): typeof Ace.edit => (el, options) => {
			try {
				const editor = _internalEdit?.(el, {
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
	ace.require(['ace/layer/font_metrics'], ({ FontMetrics }: { FontMetrics: typeof FontMetricsType; }) => {
		const metricHandlers = new WeakMap<Element, FontMetricsType>();
		const observer = new window.ResizeObserver(events => {
			for (const evt of events) {
				metricHandlers.get(evt.target)?.checkForSizeChanges();
			}
		});
		FontMetrics.prototype.$addObserver = function () {
			const node = this.$measureNode;
			if (!node) return;
			metricHandlers.set(node, this);
			observer.observe(node);
			this.$observer = {
				disconnect() {
					observer.unobserve(node);
				},
				observe() { },
				unobserve() { },
			};
		};
		const cache: Partial<Record<string, [BoxSize, boolean, Record<string, BoxSize>]>> = {};
		const _checkForSizeChanges = FontMetrics.prototype.checkForSizeChanges;
		FontMetrics.prototype.checkForSizeChanges = function (size) {
			if (!this.$measureNode) return;
			const fontStyle = window.getComputedStyle(this.$measureNode).font;
			const cached = cache[fontStyle];
			if (cached) {
				[this.$characterSize, this.allowBoldFonts, this.charSizes] = cached;
				this._emit("changeCharacterSize", {
					data: cached[0] satisfies BoxSize,
				});
				return;
			}
			this.$characterSize = { width: 0, height: 0 };
			_checkForSizeChanges.call(this, size);
			cache[fontStyle] = [this.$characterSize, this.allowBoldFonts, this.charSizes];
		};
	});
}
