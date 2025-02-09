import type { YUI } from 'yui';
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
}

declare global {
	interface Window {
		M?: unknown & Moodle;
	}
}
