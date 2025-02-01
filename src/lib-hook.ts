import type { YUI } from "yui";
import type Ace from 'ace-code';
import type VideoJS from 'video.js';
import type UCModalRegistry from './ucinterfaces/ModalRegistry';
import type UCModalEvents from './ucinterfaces/ModalEvents';
import type UCToast from './ucinterfaces/Toast';
import { maybeUnwrap, type MapType, type MaybeUnwrap } from "./global/util";

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

type AceConfig = {
	dark_theme_mode?: unknown;
};

type ModuleTypesMap = {
	"media_videojs/video-lazy": typeof VideoJS;
	"core/modal_registry": UCModalRegistry;
	"core/modal_events": UCModalEvents;
	"core/toast": UCToast;
	"filter_ace_inline/ace_inline_code": {
		initAceHighlighting(config: unknown & object): PromiseLike<void>;
		initAceInteractive(config: unknown & { button_label: string; }): PromiseLike<void>;
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

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
let YUICallbacks: ((Y: YUI) => boolean | void)[] = [];

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
export function hookYUI(callback: (Y: YUI) => boolean | void) {
	if (!window.YUI || callback(window.YUI)) YUICallbacks.push(callback);
}

declare global {
	interface Window {
		YUI?: YUI;
		YUI_config?: Parameters<YUI['applyConfig']>[0];
		Y?: YUI;
		ace?: typeof Ace;
		aceInlineCodeHighlightingDone?: boolean;
		aceInlineCodeInteractiveDone?: boolean;
	}
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
