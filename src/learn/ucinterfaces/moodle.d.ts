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
				headerContent?: string | YUINode,
				bodyContent: string | YUINode,
				draggable?: boolean,
				visible?: boolean,
				center?: boolean,
				modal?: boolean,
				width?: number | null,
				extraClasses?: string[],
			}): {
				show(): void;
				hide(): void;
			};
		};
	};
}

declare global {
	interface Window {
		M?: unknown & Moodle;
	}
}
