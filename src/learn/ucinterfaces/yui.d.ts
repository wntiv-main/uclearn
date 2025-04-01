import "yui";

export type YUI = typeof window.YUI;
type YUINode = object;
interface YUIExt {
	use(...args: [...deps: string[], ...[callback: (Y: YUI) => void]]): YUI;
	applyConfig(config: Y.IConfig): void;
	one(selector: string | Node): YUINode;
	require: Require;
	define: RequireDefine;
}

// declare namespace globalThis {
// 	const YUI: YUIExt;
// 	const Y: YUIExt;
// }

// declare const YUI: YUIExt;
// declare const Y: YUIExt;

declare global {
	// const YUI: YUIExt;
	// const Y: YUIExt;
	interface Window {
		YUI?: YUIExt;
		Y?: YUIExt;
	}
}
