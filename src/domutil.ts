import { asyncTimeout } from "./global/util";

export function compareClasses(classListA: DOMTokenList, classListB: DOMTokenList) {
	if (classListA.length !== classListB.length) return false;
	for (const item of classListA) {
		if (!classListB.contains(item)) return false;
	}
	return true;
}

export const isElement = (el: Node): el is Element => el.nodeType === Node.ELEMENT_NODE;
export const isTextNode = (el: Node): el is Text => el.nodeType === Node.TEXT_NODE;
export const isComment = (el: Node): el is Comment => el.nodeType === Node.COMMENT_NODE;
export function isElementTag<T extends keyof HTMLElementTagNameMap>(el: Element, tag: T): el is HTMLElementTagNameMap[T] {
	return el.tagName.toLowerCase() === tag;
}

export function nodeDepth(node: Node) {
	let current = node;
	let depth = 0;
	while (current.parentNode) {
		depth++;
		current = current.parentNode;
	}
	return depth;
}

export function uniqueDescriptor(el: Element) {
	return el.id.replace(/^yui_.*/, "")
		|| el.getAttribute('name')
		|| `${el.classList}`;
}


declare global {
	interface Scheduler {
		/**
		 * Adds a task to the scheduler as a callback, optionally specifying a priority, delay, and/or a signal for aborting the task.
		 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask
		 */
		postTask<T>(callback: () => T, options?: {
			/**
			 * The immutable priority of the task. One of: "user-blocking", "user-visible", "background".
			 * If set, this priority is used for the lifetime of the task and priority set on the signal is ignored.
			 */
			priority?: "user-blocking" | "user-visible" | "background";

			/**
			 * A TaskSignal or AbortSignal that can be used to abort the task(from its associated controller).
			 * If the options.priority parameter is set then the task priority cannot be changed, and any priority on the signal is ignored.
			 * Otherwise, if the signal is a TaskSignal its priority is used to set the initial task priority, and the signal's controller may later use it to change the task priority.
			 */
			signal?: AbortSignal;

			/**
			 * The minimum amount of time after which the task will be added to the scheduler queue, in whole milliseconds.
			 * The actual delay may be higher than specified, but will not be less.
			 * The default delay is 0.
			 */
			delay?: number;
		}): Promise<T>;
		/**
		 * Yields control of the main thread back to the browser, returning a promise that resolves to continue execution where it left off.
		 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
		 */
		yield?(): Promise<void>;
	}
	interface Window {
		scheduler?: Scheduler;
	}
}

export const yieldToMain = window.scheduler?.yield
	? () => window.scheduler?.yield?.()
	: () => asyncTimeout(0);
