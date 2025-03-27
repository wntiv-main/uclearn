import type { YUI } from "./ucinterfaces/yui";
import type Ace from 'ace-code';
import type VideoJS from 'video.js';
import type UCModalRegistry from './ucinterfaces/ModalRegistry';
import type UCModalEvents from './ucinterfaces/ModalEvents';
import type UCToast from './ucinterfaces/Toast';
import { maybeUnwrap, type MapType, type MaybeUnwrap } from "../global/util";
import { getRemappedName, patch, patchT, tailHook, tailHookLocals } from "./patch";
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
	// 	,
	// 	Gap.prototype.deleteChar = function (gaps, pos) {
	// 		this.textSize -= 1,
	// 			this.editor.session.remove(new Range(pos.row, pos.column, pos.row, pos.column + 1)),
	// 			this.textSize >= this.minWidth ? this.changeWidth(gaps, -1) : this.editor.session.insert({
	// 				row: pos.row,
	// 				column: this.range.end.column - 1
	// 			}, " ");
	// 	}
	// 	,
	// 	Gap.prototype.deleteRange = function (gaps, start, end) {
	// 		for (let i = start; i < end; i++)
	// 			start < this.range.start.column + this.textSize && this.deleteChar(gaps, {
	// 				row: this.range.start.row,
	// 				column: start
	// 			});
	// 	}
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
								const gap: Gap = that.findCursorGap(cursor);
								console.log(e);
								if (e.command.name === 'startAutocomplete'
									|| e.command.name === 'Down'
									|| e.command.name === 'Up'
									|| e.command.name === 'Tab'
									|| e.command.name === 'Return') return;
								if (e.command.name?.startsWith('select')
									&& e.command.name !== 'selectall') {
									const range = e.editor.getSelectionRange();
									const target: Ace.Ace.Point | null = e.command.name === 'selectleft' ? { row: cursor.row, column: cursor.column - 1 }
										: e.command.name === 'selectright' ? { row: cursor.row, column: cursor.column + 1 }
											: e.command.name === 'selectup' ? { row: cursor.row - 1, column: cursor.column }
												: e.command.name === 'selectdown' ? { row: cursor.row + 1, column: cursor.column } : null;

									if (!gap || !gap.range.containsRange(range) || (target && gap.range.containsRange(range) && gap.range.contains(target.row, target.column)))
										return;
									if (e.command.name === 'selectwordleft') {
										e.editor.selection.selectWordLeft();
										const c2 = e.editor.selection.getCursor();
										if (!gap.range.contains(c2.row, c2.column)) e.editor.selection.selectToPosition(gap.range.start);
									}
									if (e.command.name === 'selectwordright') {
										e.editor.selection.selectWordRight();
										const c2 = e.editor.selection.getCursor();
										if (!gap.range.contains(c2.row, c2.column)) e.editor.selection.selectToPosition(gap.range.end);
									}
								}
								const operation = e.editor.curOp && (e.editor.curOp as { command?: { name?: string; }; }).command;
								if (operation?.name === 'insertMatch'
									|| operation?.name === 'Tab'
									|| operation?.name === 'Return') {
									const start = (e.editor.curOp as { selectionBefore: Ace.Range; }).selectionBefore.start;
									const end = e.editor.selection.getCursor();
									for (let i = start.column; i > end.column; i--) cb({
										editor: e.editor,
										command: {
											name: "del",
										},
										args: [],
										preventDefault() { },
										stopPropagation() { },
									} as Parameters<typeof cb>[0]);
								}
								if (e.command.name === 'removewordleft') {
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
								} if (e.command.name === 'removewordright') {
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
