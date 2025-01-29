declare const process: {
	env: {
		UCLEARN_DEBUG?: '0' | '1';
		UCLEARN_DEBUG_FLAGS?: string;
	};
};

declare global {
	interface Window {
		process: typeof process;
	}
}
window.process = { env: {} };

export const DEBUG = !!+(process.env.UCLEARN_DEBUG ?? 0);
const DEBUG_FLAGS = DEBUG ? (process.env.UCLEARN_DEBUG_FLAGS ?? "").toLowerCase().split(/,\s*/g).filter(x => x) : [];
export const DEBUG_HYDRATION = DEBUG_FLAGS.includes('hydration');
export const DEBUG_SCRIPTING = DEBUG_FLAGS.includes('scripting');
