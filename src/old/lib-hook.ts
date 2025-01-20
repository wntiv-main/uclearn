import type { YUI } from "yui";

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

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
let YUICallbacks: ((Y: YUI) => boolean | void)[] = [];

// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
export function hookYUI(callback: (Y: YUI) => boolean | void) {
	if (!window.YUI || callback(window.YUI)) YUICallbacks.push(callback);
}

declare global {
	interface Window {
		YUI?: YUI;
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
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		((window as any).YUI as YUI) ??
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
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		((window as any).Y as YUI) ??
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
