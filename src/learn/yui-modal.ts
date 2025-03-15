import { getYUIInstance } from "./lib-hook";

export const moodleDialog = new Promise<NonNullable<NonNullable<NonNullable<typeof window.M>['core']>['dialogue']>>((res, rej) => getYUIInstance().then(Y =>
	Y.require(['moodle-core-notification-dialogue'], () => window.M?.core?.dialogue ? res(window.M.core.dialogue)
		: rej(new Error("moodle-core-notification-dialogue failed to initialize")))));

moodleDialog.then(dialog => {
	const center = dialog.prototype.centerDialogOnDialogSizeChange;
	dialog.prototype.centerDialogOnDialogSizeChange = function (e: { get(key: string): unknown; }) {
		if (e.get('draggable')) return;
		return center.call(this, e);
	};
});
