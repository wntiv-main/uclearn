import type { YUI } from "../ucinterfaces/yui";
import type Ace from 'ace-code';
import { maybeUnwrap, type MapType, type MaybeUnwrap } from "../../global/util";
import type monaco from "monaco-editor";
import { LazyPromise } from "../../global/lazy-promise";
import { type DefineArgs, type ModuleTypesMap, type RequireFunctionDeps, REQUIREJS_PATCHES } from "./requirejs-patches";

// users of REQUIREJS_PATCHES
import './videojs-patches';
import './ace-patches';
import './yui-modal';

let _require_promise: Promise<Require>;
export async function getRequire() {
	return (
		typeof window.require === 'function' ? window.require :
			// biome-ignore lint/suspicious/noAssignInExpressions: shhh
			(await (_require_promise ??= new Promise((res) => {
				let _require: Require | undefined = undefined;
				Object.defineProperty(window, "require", {
					get() {
						return _require;
					},
					set(value) {
						_require = value;
						if (typeof _require === 'function') res(_require);
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

export async function requireModule<T extends (keyof ModuleTypesMap)[]>(...deps: T) {
	const require = await getRequire();
	return new Promise<MaybeUnwrap<MapType<ModuleTypesMap, T>>>(res => require(deps, (...mods: MapType<ModuleTypesMap, T>) => res(maybeUnwrap(mods))));
}

export const videoJS = LazyPromise.wrap(() => requireModule("media_videojs/video-lazy"));
export const modals = LazyPromise.wrap(() => requireModule("core/modal_registry", "core/modal_events"));
export const Toast = LazyPromise.wrap(() => requireModule("core/toast"));
export const initAce = LazyPromise.wrap(() => requireModule('filter_ace_inline/ace_inline_code'));

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
			const ready = REQUIREJS_PATCHES[name as keyof ModuleTypesMap]?.(fn as never, (details?.requires ?? []) as (keyof ModuleTypesMap)[], name as never, version) ?? fn;
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
