import type Ace from "ace-code";

import type { LanguageProvider } from "ace-linters";
import { AceLanguageClient } from "ace-linters/build/ace-language-client";
import { EXT_URL } from "./constants";
import JSZip from "jszip";
import { getAce, initAce, REQUIREJS_PATCHES } from "./lib-hook";
import { onPostHydrate } from "./navigation";
import { tailHookLocals } from "./patch";
import { Gap, GapCtor } from "./ucinterfaces/ace-gapfiller-ui";

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
	onPostHydrate(async (first) => {
		if (first) return;
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

REQUIREJS_PATCHES['qtype_coderunner/ui_ace_gapfiller'] = (ready) => tailHookLocals(
	ready,
	['Gap'],
	(Gap: GapCtor) => {
		// Tail hook to patch Gap prototype
		const _insert = Gap.prototype.insertChar;
		Gap.prototype.insertChar = function (gaps, pos, char) {
			if (char.length !== 1) return this.insertText(gaps, pos.column, char);
			return _insert.call(this, gaps, pos, char);
		};
	},
	{},
	undefined,
	src => src.replace(/editor\.commands\.on\(['"]exec['"],\s*/,
		`$&(${(cb: Ace.Ace.execEventHandler): Ace.Ace.execEventHandler => e => {
			// Patch exec handler
			const that = eval('t');
			const cursor = e.editor.selection.getCursor();
			const range = e.editor.getSelectionRange();
			const gap: Gap = that.findCursorGap(cursor);
			console.log(e);
			// Revert these to default behavior
			if (gap && gap.range.containsRange(range) && (e.command.name === 'startAutocomplete'
				|| e.command.name === 'Down'
				|| e.command.name === 'Up'
				|| e.command.name === 'Tab'
				|| e.command.name === 'Return'
				// || e.command.name === 'undo'
				// || e.command.name === 'redo'
			)) return;
			if (gap && e.command.name === 'undo') {
				const manager = e.editor.session.getUndoManager();
				const revision = manager.getRevision();
				const oldSel = manager.getSelection(revision).value as unknown as Ace.Range;
				const sel = manager.getSelection(revision + 1).value as unknown as Ace.Range;
				if (/*deltas?.length*/manager.canUndo()) {
					const delta = oldSel.end.column - sel.end.column;
					console.log([...manager.selections], oldSel, '<=', sel, delta, gap.textSize, gap.minWidth);
					e.editor.undo();
					const oldSize = gap.textSize;
					gap.textSize += delta;
					if (Math.max(oldSize, gap.minWidth) !== Math.max(gap.textSize, gap.minWidth))
						gap.changeWidth(that.gaps, Math.max(gap.textSize, gap.minWidth) - Math.max(oldSize, gap.minWidth));
				}
			}
			if (gap && (e.command.name === 'gotoright' || e.command.name === 'gowordright') && cursor.column >= gap.range.start.column + gap.textSize) {
				if (gap.range.end.column + 1 >= e.editor.session.getLine(cursor.row).length) {
					e.editor.selection.moveTo(cursor.row + 1, 0);
					(e as Partial<Event>).preventDefault?.();
					(e as Partial<Event>).stopPropagation?.();
					return;
				}
			}
			if (e.command.name?.startsWith('select')
				&& e.command.name !== 'selectall') {
				const target: Ace.Ace.Point | null = e.command.name === 'selectleft' ? { row: cursor.row, column: cursor.column - 1 }
					: e.command.name === 'selectright' ? { row: cursor.row, column: cursor.column + 1 }
						: e.command.name === 'selectup' ? { row: cursor.row - 1, column: cursor.column }
							: e.command.name === 'selectdown' ? { row: cursor.row + 1, column: cursor.column } : null;
				if (gap && target && target.column > gap.range.start.column + gap.textSize)
					target.column = gap.range.end.column + 1;
				// Handle crossing over gap
				if (gap && target && !gap.range.containsRange(range) && target.column >= e.editor.session.getLine(cursor.row).length) {
					e.editor.selection.selectTo(target.row + 1, 0);
					(e as Partial<Event>).preventDefault?.();
					(e as Partial<Event>).stopPropagation?.();
					return;
				}
				// Revert to default behavior if selection should be allowed
				if (!gap || !gap.range.containsRange(range))
					return;
				// allow within-gap selection
				if (target && gap.range.containsRange(range) && gap.range.contains(target.row, target.column))
					return;
				if (e.command.name === 'selectwordleft') {
					// Select word, constrain to gap
					e.editor.selection.selectWordLeft();
					const c2 = e.editor.selection.getCursor();
					if (!gap.range.contains(c2.row, c2.column)) e.editor.selection.selectToPosition(gap.range.start);
				}
				if (e.command.name === 'selectwordright') {
					// Select word, constrain to gap
					e.editor.selection.selectWordRight();
					const c2 = e.editor.selection.getCursor();
					if (!gap.range.contains(c2.row, c2.column)) e.editor.selection.selectToPosition(gap.range.end);
				}
			}
			const operation = e.editor.curOp && (e.editor.curOp as { command?: { name?: string; }; }).command;
			if (gap && gap.range.containsRange(range)
				&& (operation?.name === 'insertMatch'
					|| operation?.name === 'Tab'
					|| operation?.name === 'Return')) {
				// Ensure gap stays up-to-date
				const start = (e.editor.curOp as { selectionBefore: Ace.Range; }).selectionBefore.start;
				gap.textSize -= start.column - cursor.column;
			}
			if (gap && gap.range.containsRange(range) && e.command.name === 'removewordleft') {
				// Select word and trigger remove
				e.editor.selection.selectWordLeft();
				const c2 = e.editor.selection.getCursor();
				if (!gap.range.contains(c2.row, c2.column)) e.editor.selection.selectToPosition(gap.range.start);
				if (!e.editor.selection.isEmpty()) {
					cb({
						editor: e.editor,
						command: {
							name: "del",
						},
						args: [],
						preventDefault() { },
						stopPropagation() { },
					} as Parameters<typeof cb>[0]);
				}
			}
			if (gap && gap.range.containsRange(range) && e.command.name === 'removewordright') {
				// Select word and trigger remove
				e.editor.selection.selectWordRight();
				const c2 = e.editor.selection.getCursor();
				if (!gap.range.contains(c2.row, c2.column)) e.editor.selection.selectToPosition(gap.range.end);
				if (!e.editor.selection.isEmpty()) {
					cb({
						editor: e.editor,
						command: {
							name: "del",
						},
						args: [],
						preventDefault() { },
						stopPropagation() { },
					} as Parameters<typeof cb>[0]);
				}
			}
			// Default behaviour
			cb(e);
		}})`),
);
