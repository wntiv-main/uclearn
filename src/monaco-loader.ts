import type Ace from "ace";
import type * as Monaco from 'monaco-editor';
import { DEBUG } from "./global/constants";
import { EXT_URL } from "./constants";
import { getRequire } from "./lib-hook";
import { update } from "./global/util";

declare const monaco: typeof Monaco;

(async () => {
	const require = await getRequire();
	// const loaderScript = loadScript(`${EXT_URL}/monaco/loader.js`);
	// await execScript(null, await loaderScript);
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	require.config(update((require as any).s.contexts._.config, { paths: { vs: `${EXT_URL}/monaco` } }));
	// const editorScript = loadScript(`${EXT_URL}/monaco/editor/editor.main.js`);
	// await execScript(null, await editorScript);
	require(['vs/editor/editor.main'], () => { });
})();

// const monacoScript = document.createElement("script");
// monacoScript.classList.add('__uclearn-skip-reload');
// monacoScript.src = chrome.runtime.getURL("monaco/loader.js");
// root.prepend(monacoScript);
// const monacoScript2 = document.createElement("script");
// monacoScript2.classList.add('__uclearn-skip-reload');
// monacoScript2.src = chrome.runtime.getURL("monaco/editor/editor.main.js");
// root.prepend(monacoScript2);

function modeLanguage(mode: string | undefined) {
	return mode?.replace(/^ace\/mode\/(.*)$/, "$1");
}

function mapOptions(options: Partial<Ace.Ace.EditorOptions>) {
	return {
		readOnly: options?.readOnly,
		automaticLayout: true,
		renderLineHighlight: (options?.highlightActiveLine ?? true) && options?.highlightGutterLine ? 'all'
			: (options?.highlightActiveLine ?? true) ? 'line'
				: options?.highlightGutterLine ? 'gutter'
					: 'none',
		lineNumbers: (options?.showLineNumbers ?? true) && (options?.showGutter ?? true) ? 'on' : 'off',
		tabSize: options?.tabSize,
		insertSpaces: options?.useSoftTabs,
		detectIndentation: options?.tabSize === undefined && options?.useSoftTabs === undefined,
		minimap: {
			enabled: false,
		},
		scrollBeyondLastLine: options?.scrollPastEnd ?? false,
		renderWhitespace: options?.showInvisibles ? 'all' : 'selection',
		language: modeLanguage(options?.mode),
		renderFinalNewline: 'dimmed',
		fontSize: options?.fontSize,
		fontFamily: options?.fontFamily,
		autoIndent: 'advanced',// options?.enableAutoIndent ? 'advanced' : 'none',
		scrollbar: {
			alwaysConsumeMouseWheel: false,
			horizontal: options?.hScrollBarAlwaysVisible ? 'visible' : 'auto',
			vertical: options?.vScrollBarAlwaysVisible ? 'visible' : 'auto',
		},
		occurrencesHighlight: (options?.highlightSelectedWord ?? true) ? 'singleFile' : 'off',
		placeholder: options?.placeholder,
		value: options?.value,
		theme: window.matchMedia("(prefers-color-scheme: dark)") ? 'vs-dark' : 'vs',
		suggest: {
			showWords: false,
		},
	} satisfies Monaco.editor.IStandaloneEditorConstructionOptions;
}

const _ace: Partial<typeof Ace> = {
	version: "1.4.13", // spoof
};

function debugTrap<T extends object>(obj: T) {
	return new Proxy(obj, {
		get(target, p, receiver) {
			if (!(p in target))
				console.warn("Attempted access of undefined prop:", p, "on", target);
			const result = Reflect.get(target, p, receiver);
			if (typeof result === 'object' && result != null && result.constructor === Object) return debugTrap(result);
			return result;
		},
	});
}

Object.defineProperty(_ace, 'edit', {
	get: () => function edit(element, options) {
		const el = (typeof element === 'string' ? document.getElementById(element) : element) as HTMLElement;
		el.replaceChildren();
		const editor = monaco.editor.create(el, mapOptions(options ?? {}));
		// biome-ignore lint/style/noNonNullAssertion: must have model
		const model = editor.getModel()!;
		const lineEnding = options?.newLineMode === "windows" ? '\r\n' : '\n';
		let result = {
			container: editor.getContainerDomNode(),
			id: editor.getId(),
			session: {
				getValue: () => editor.getValue({ preserveBOM: false, lineEnding }),
				setValue: (value) => editor.setValue(value),
				setMode(mode: string, callback) {
					monaco.editor.setModelLanguage(model, modeLanguage(mode) ?? 'plaintext');
					callback?.();
				},
				on(name: "changeFold" | "changeScrollLeft" | "changeScrollTop" | "tokenizerUpdate" | keyof HTMLElementEventMap, callback: (e: unknown) => void) {
					switch (name) {
						case "focus":
							editor.onDidFocusEditorText(callback);
							break;
						case "blur":
							editor.onDidBlurEditorText(callback);
							break;
						case 'input':
						case "change":
							editor.onDidChangeModelContent(callback);
							break;
						default:
							if (DEBUG) console.warn("Attempted to add event for", name, ':', callback);
							break;
					}
				}
			} as Ace.Ace.EditSession,
			renderer: {
				on(..._) { },
			} as Ace.Ace.VirtualRenderer,
			commands: {
				bindKeys(keys) { },
			} as Ace.Ace.CommandManager,
			setOptions(optList) {
				editor.updateOptions(mapOptions(optList as Partial<Ace.Ace.EditorOptions>));
			},
			setReadOnly(readOnly) {
				editor.updateOptions({ readOnly });
			},
			setTheme(theme) {
				if (['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(theme))
					monaco.editor.setTheme(theme);
			},
			getTheme: () => 'vs', // TODO:
			focus: () => editor.focus(),
			navigateFileEnd: () => editor.setPosition(model.getFullModelRange().getEndPosition()),
			getSession() {
				return this.session;
			},
			on(name, callback: (e: unknown) => void) {
				switch (name) {
					case "changeSession":
						editor.onDidChangeModel(callback);
						break;
					default:
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						this.session.on(name as any, callback);
						break;
				}
			},
			resize() {
				editor.layout();
			}
		} as Ace.Ace.Editor;
		if (DEBUG) result = debugTrap(result);
		return result;
	} satisfies typeof Ace.edit,
	set: (v) => { },
});

export function patchAceEditor() {
	Object.defineProperty(window, 'ace', {
		get: () => _ace,
		set: (v) => { console.log("Caught ACE init", v); },
	});
}
