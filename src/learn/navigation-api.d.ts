import type { Shifted } from "../global/util";

interface NavigationDestination {
	readonly id: string;
	readonly index: number;
	readonly key: string;
	readonly sameDocument: boolean;
	readonly url: string | URL; // TODO

	getState(): unknown;
}

interface NavigationCurrentEntryChangeEvent extends Event {
	readonly from: NavigationHistoryEntry;
	readonly navigationType: 'push' | 'reload' | 'replace' | 'traverse';
}

interface NavigateEvent extends Event {
	readonly canIntercept: boolean;
	readonly destination: NavigationDestination;
	readonly downloadRequest: string | null;
	readonly formData: FormData | null;
	readonly hashChange: boolean;
	readonly hasUAVisualTransition: boolean;
	readonly info?: unknown;
	readonly navigationType: 'push' | 'reload' | 'replace' | 'traverse';
	readonly signal: AbortSignal;
	readonly sourceElement?: Element;
	readonly userInitiated: boolean;

	intercept(options?: {
		handler?(): Promise<void>;
		focusReset?: 'after-transition' | 'manual';
		scroll?: 'after-transition' | 'manual';
	}): void;
	scroll(): void;
}

interface NavigationTransition {
	readonly finished: Promise<void>;
	readonly from: NavigationHistoryEntry;
	readonly navigationType: 'push' | 'reload' | 'replace' | 'traverse';
}

type NavigationEventMap = {
	currententrychange: NavigationCurrentEntryChangeEvent;
	navigate: NavigateEvent;
	navigateerror: Event;
	navigatesuccess: Event;
};

type NavigationResult = {
	committed: Promise<void>;
	finished: Promise<void>;
};

export interface Navigation extends EventTarget {
	readonly activation: NavigationActivation;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;
	readonly currentEntry: NavigationHistoryEntry;
	readonly transition: NavigationTransition | null;

	back(options?: { info?: unknown; }): NavigationResult;
	forward(options?: { info?: unknown; }): NavigationResult;
	navigate(url: string, options?: { state?: unknown; info?: unknown; history?: 'auto' | 'push' | 'replace'; }): NavigationResult;
	reload(options?: { state?: unknown; info?: unknown; }): NavigationResult;
	traverseTo(key: string, options?: { info?: unknown; }): NavigationResult;
	entries(): NavigationHistoryEntry[];
	updateCurrentEntry(options?: { state?: unknown; }): void;

	addEventListener<K extends keyof NavigationEventMap>(event: K, callback: (event: NavigationEventMap[K]) => unknown, ...args: Shifted<Shifted<Parameters<typeof addEventListener>>>);
	removeEventListener<K extends keyof NavigationEventMap>(event: K, callback: (event: NavigationEventMap[K]) => unknown, ...args: Shifted<Shifted<Parameters<typeof removeEventListener>>>);
}

declare global {
	interface Window {
		navigation?: Navigation;
	}
}
