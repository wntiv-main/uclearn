import type { YUI } from "./ucinterfaces/yui";
import type Ace from 'ace-code';
import type VideoJS from 'video.js';
import type UCModalRegistry from './ucinterfaces/ModalRegistry';
import type UCModalEvents from './ucinterfaces/ModalEvents';
import type UCToast from './ucinterfaces/Toast';
import { maybeUnwrap, type MapType, type MaybeUnwrap } from "../global/util";
import { getRemappedName, tailHook } from "./patch";
import { onPreHydrate } from "./navigation";
import type monaco from "monaco-editor";
import { AceGapfillerUiCtor } from "./ucinterfaces/ace-gapfiller-ui";

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
	'moodle-core-notification-dialogue': undefined;
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


// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing stub
declare let visibleCoursesId: string | null;

export const REQUIREJS_PATCHES: {
	[K in keyof ModuleTypesMap]?: <Deps extends (keyof ModuleTypesMap)[]>(
		ready: (...deps: RequireFunctionDeps<Deps>) => ModuleTypesMap[K],
		deps: Deps,
		name: K,
		version?: string,
	) => void | undefined | ((...deps: RequireFunctionDeps<Deps>) => ModuleTypesMap[K])
} = {
	"block_recentlyaccessedcourses/main"(ready, _, name) {
		return tailHook(
			ready,
			() => { onPreHydrate(() => { visibleCoursesId = null; }); },
			{ [getRemappedName(() => onPreHydrate)]: onPreHydrate },
			`<module init: ${name}>`,
		);
	}
};

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
			ready = REQUIREJS_PATCHES[name]?.(ready as never, deps, name as never) ?? ready;
			return Reflect.apply(target, thisArg, [name, deps, ready]);
		}
	});
}

function patchYUIDefine(define: typeof YUI.add) {
	return new Proxy(define, {
		apply(target, thisArg, argArray) {
			const [name, fn, version, details = undefined] = argArray as Parameters<typeof YUI.add>;
			let ready = REQUIREJS_PATCHES[name as keyof ModuleTypesMap]?.(fn as never, (details?.requires ?? []) as (keyof ModuleTypesMap)[], name as never, version) ?? fn;
			return Reflect.apply(target, thisArg, [name, ready, version, details]);
		}
	});
}

// let _internalDefine: RequireDefine = patchDefine(window.define);
// Object.defineProperty(window, 'define', {
// 	get: () => _internalDefine,
// 	set(v) {
// 		_internalDefine = patchDefine(v);
// 	},
// });

getRequire().then(() => { window.define = patchDefine(window.define); });
getYUI().then(YUI => { YUI.add = patchYUIDefine(YUI.add); });

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
// let YUICallbacks: ((Y: YUI) => boolean | void)[] = [];

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
// export function hookYUI(callback: (Y: YUI) => boolean | void) {
// 	if (!window.YUI || callback(window.YUI)) YUICallbacks.push(callback);
// }

// if (window.YUI) {
// 	// TODO: can we write a getter post-mortem?
// 	// biome-ignore lint/style/noNonNullAssertion: Called immediately
// 	YUICallbacks = YUICallbacks.filter((c) => !c(window.YUI!));
// } else {
// 	let _YUI: YUI | undefined = undefined;
// 	Object.defineProperty(window, "YUI", {
// 		get() {
// 			return _YUI;
// 		},
// 		set(value) {
// 			_YUI = value;
// 			// biome-ignore lint/style/noNonNullAssertion: Called immediately
// 			if (_YUI) YUICallbacks = YUICallbacks.filter((c) => !c(_YUI!));
// 		},
// 	});
// }

let _YUI_promise: Promise<YUI>;
export async function getYUI() {
	return (
		window.YUI ??
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		(await (_YUI_promise ??= new Promise((res) => {
			let _YUI: YUI | undefined = undefined;
			Object.defineProperty(window, "YUI", {
				get() {
					return _YUI;
				},
				set(value) {
					_YUI = value;
					if (_YUI) res(_YUI);
				},
			});
		})))
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
}
