import type { YUINode } from 'yui';
interface Moodle {
	cfg?: {
		courseId: number;
	};
	mod_quiz?: {
		timer?: {
			timeoutid: ReturnType<typeof setTimeout> | null;
			endtime: number;
			init(Y: typeof YUI, start: number, preview: number);
			stop(e?: unknown): void;
			update();
			updateEndTime(timeleft: number);

			toggleVisibility();
			setVisibility(visible: boolean, updatePref = true);
		};
	};
	core?: {
		dialogue?: {
			new(config: {
				id?: string,
				headerContent?: string | YUINode,
				bodyContent: string | YUINode,
				draggable?: boolean,
				visible?: boolean,
				center?: boolean,
				modal?: boolean,
				closeButton?: boolean,
				closeButtonTitle?: string,
				width?: string | number | null,
				extraClasses?: string[],
			}): {
				applyAndTrapFocus(): void;
				trapFocus(element: Node, direction: 'forward' | 'backward'): void;
				show(): void;
				hide(): void;
				destroy(): void;
				on(event: string, cb: (e: unknown) => void): void;
			};
		};
	};
}

declare global {
	interface Window {
		M?: unknown & Moodle;
	}
}
