import type { YUI } from "./ucinterfaces/yui";
import type Ace from 'ace-code';
import type VideoJS from 'video.js';
import type UCModalRegistry from './ucinterfaces/ModalRegistry';
import type UCModalEvents from './ucinterfaces/ModalEvents';
import type UCToast from './ucinterfaces/Toast';
import { maybeUnwrap, type MapType, type MaybeUnwrap } from "../global/util";
import { getRemappedName, patch, tailHook, tailHookLocals } from "./patch";
import { onPreHydrate } from "./navigation";
import type monaco from "monaco-editor";

let _require_promise: Promise<Require>;
export async function getRequire() {
	return (
		window.require ??
		// biome-ignore lint/suspicious/noAssignInExpressions: shhh
		(await (_require_promise ??= new Promise((res) => {
			let _require: Require | undefined = undefined;
			Object.defineProperty(window, "require", {
				get() {
					return _require;
				},
				set(value) {
					_require = value;
					if (_require instanceof Function) res(_require);
				},
			});
		})))
	);
}

declare global {
	interface Window {
		YUI_config?: Parameters<YUI['applyConfig']>[0];
		ace?: typeof Ace;
		aceInlineCodeHighlightingDone?: boolean;
		aceInlineCodeInteractiveDone?: boolean;
		monaco?: typeof monaco;
	}
}

type AceGapfillerUi = object;
type AceGapfillerUiCtor = { new(): AceGapfillerUi, prototype: AceGapfillerUi; };
type GapPos = {
	row: number;
	column: number;
};
type Gap = {
	textSize: number;
	range: Ace.Range;
	// 	Gap.prototype.cursorInGap = function (cursor) {
	// 	return cursor.row >= this.range.start.row && cursor.column >= this.range.start.column && cursor.row <= this.range.end.row && cursor.column <= this.range.end.column;
	// }
	// 	,
	// 	Gap.prototype.getWidth = function () {
	// 		return this.range.end.column - this.range.start.column;
	// 	}
	// 	,
	// 	Gap.prototype.changeWidth = function (gaps, delta) {
	// 		this.range.end.column += delta;
	// 		for (let i = 0; i < gaps.length; i++) {
	// 			let other = gaps[i];
	// 			other.range.start.row === this.range.start.row && other.range.start.column > this.range.start.column && (other.range.start.column += delta,
	// 				other.range.end.column += delta);
	// 		}
	// 		this.editor.$onChangeBackMarker(),
	// 			this.editor.$onChangeFrontMarker();
	// 	}
	// 	,
	insertChar(gaps: Gap[], pos: GapPos, char: string): void;
	deleteChar(gaps: Gap[], pos: GapPos): void;
	deleteRange(gaps: Gap[], start: number, end: number): void;
	insertText(gaps: Gap[], start: number, text: string): void;
	getText(): string;
};
type GapCtor = { new(editor: Ace.Editor, row: number, column: number, minWidth: number, maxWidth?: number): Gap, prototype: Gap; };

type ModuleTypesMap = {
	"media_videojs/video-lazy": typeof VideoJS;
	"core/modal_registry": UCModalRegistry;
	"core/modal_events": UCModalEvents;
	"core/toast": UCToast;
	"filter_ace_inline/ace_inline_code": {
		initAceHighlighting(config: unknown & object): PromiseLike<void>;
		initAceInteractive(config: unknown & { button_label: string; }): PromiseLike<void>;
	};
	"block_recentlyaccessedcourses/main": {
		init(userid: number, root: Element): void;
	};
	'vs/editor/editor.main': null;
	'qtype_coderunner/ui_ace_gapfiller': {
		Constructor: AceGapfillerUiCtor;
	};
};

export async function requireModule<T extends (keyof ModuleTypesMap)[]>(...deps: T) {
	const require = await getRequire();
	return new Promise<MaybeUnwrap<MapType<ModuleTypesMap, T>>>(res => require(deps, (...mods: MapType<ModuleTypesMap, T>) => res(maybeUnwrap(mods))));
}

export const videoJS = requireModule('media_videojs/video-lazy');
export const modals = requireModule('core/modal_registry', 'core/modal_events');
export const Toast = requireModule('core/toast');
export const initAce = requireModule('filter_ace_inline/ace_inline_code');

type RequireFunctionDeps<T extends (keyof ModuleTypesMap)[]> = { [K in keyof T]: ModuleTypesMap[T[K]] };

type DefineArgs<K extends keyof ModuleTypesMap = keyof ModuleTypesMap, D extends (keyof ModuleTypesMap)[] = (keyof ModuleTypesMap)[]> =
	| [config: { [key: string]: unknown; }]
	| [func: () => unknown]
	| [ready: (...deps: RequireFunctionDeps<D>) => unknown]
	| [ready: (require: Require, exports: { [key: string]: unknown; }, module: RequireModule) => unknown]
	| [name: K, deps: D, (...deps: RequireFunctionDeps<D>) => ModuleTypesMap[K]]
	| [name: K, () => ModuleTypesMap[K]];

function patchDefine(define: RequireDefine) {
	return new Proxy(define, {
		apply(target, thisArg, argArray) {
			const args = argArray as DefineArgs;
			if (!(typeof args[0] === 'string')) return Reflect.apply(target, thisArg, argArray);
			let name: keyof ModuleTypesMap = argArray[0];
			let deps: (keyof ModuleTypesMap)[];
			let ready: (..._deps: RequireFunctionDeps<typeof deps>) => ModuleTypesMap[typeof name];
			if (argArray.length === 2) {
				[name, ready] = argArray;
				deps = [];
			} else[name, deps, ready] = argArray;
			switch (name) {
				case "block_recentlyaccessedcourses/main": {
					// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing stub
					let visibleCoursesId: string | null;
					ready = tailHook(
						ready,
						() => { onPreHydrate(() => { visibleCoursesId = null; }); },
						{ [getRemappedName(() => onPreHydrate)]: onPreHydrate },
						`<module init: ${name}>`,
					);
					break;
				}
				case 'qtype_coderunner/ui_ace_gapfiller': {
					ready = tailHookLocals(
						ready,
						['Gap'],
						(Gap: GapCtor) => {
							const _insert = Gap.prototype.insertChar;
							Gap.prototype.insertChar = function (gaps, pos, char) {
								if (char.length !== 1) return this.insertText(gaps, pos.column, char);
								return _insert.call(this, gaps, pos, char);
							};
						},
						{ patch },
						undefined,
						src => src.replace(/editor\.commands\.on\(['"]exec['"],\s*/,
							`$&(${(cb: Ace.Ace.execEventHandler): Ace.Ace.execEventHandler => e => {
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
								// if (e.command.name === 'undo') {
								// 	const manager = e.editor.session.getUndoManager();
								// 	const deltas = manager.lastDeltas;
								// 	// for (const delta of deltas ?? []) {
								// 	// 	delta.
								// 	// }
								// 	e.editor.undo();
								// }
								if (gap && e.command.name === 'gotoright' && cursor.column >= gap.range.start.column + gap.textSize) {
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
					break;
				}
			}
			return Reflect.apply(target, thisArg, [name, deps, ready]);
		}
	});
}

getRequire().then(() => {
	window.define = patchDefine(window.define);
	// let _internalDefine: RequireDefine = patchDefine(window.define);
	// Object.defineProperty(window, 'define', {
	// 	get: () => _internalDefine,
	// 	set(v) {
	// 		_internalDefine = patchDefine(v);
	// 	},
	// });
});

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
let YUICallbacks: ((Y: YUI) => boolean | void)[] = [];

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
export function hookYUI(callback: (Y: YUI) => boolean | void) {
	if (!window.YUI || callback(window.YUI)) YUICallbacks.push(callback);
}

if (window.YUI) {
	// TODO: can we write a getter post-mortem?
	// biome-ignore lint/style/noNonNullAssertion: Called immediately
	YUICallbacks = YUICallbacks.filter((c) => !c(window.YUI!));
} else {
	let _YUI: YUI | undefined = undefined;
	Object.defineProperty(window, "YUI", {
		get() {
			return _YUI;
		},
		set(value) {
			_YUI = value;
			// biome-ignore lint/style/noNonNullAssertion: Called immediately
			if (_YUI) YUICallbacks = YUICallbacks.filter((c) => !c(_YUI!));
		},
	});
}

let _YUI_promise: Promise<YUI>;
export async function getYUI() {
	return (
		window.YUI ??
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		(await (_YUI_promise ??= new Promise((res) =>
			hookYUI((YUI) => {
				res(YUI);
				return true;
			}),
		)))
	);
}

let _YUIInst_promise: Promise<YUI>;
export async function getYUIInstance() {
	return (
		window.Y ??
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		(await (_YUIInst_promise ??= new Promise((res) => {
			let _Y: YUI | undefined = undefined;
			Object.defineProperty(window, "Y", {
				get() {
					return _Y;
				},
				set(value) {
					_Y = value;
					if (_Y) res(_Y);
				},
			});
		})))
	);
}

let _acePromise: Promise<typeof Ace> | null = null;
export async function getAce() {
	_acePromise ??= new Promise(res => {
		let _ace: typeof Ace | null = null;
		Object.defineProperty(window, 'ace', {
			get: () => _ace,
			set(v) {
				_ace = v;
				res(v);
			}
		});
	});
	return _acePromise;
};;;;;;
