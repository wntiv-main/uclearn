import { getYUIInstance } from "./lib-hook";
import { PAGE_LOAD } from "../navigation";
import { REQUIREJS_PATCHES } from "./requirejs-patches";

let _moodleDialog: Promise<NonNullable<NonNullable<NonNullable<typeof window.M>['core']>['dialogue']>> | null = null;
export async function getMoodleDialog() {
	await PAGE_LOAD; // Dont require too early, M.utils may not be ready yet for i18n
	_moodleDialog ??= new Promise((res, rej) => getYUIInstance().then(Y =>
		Y.require(['moodle-core-notification-dialogue'], () => window.M?.core?.dialogue ? res(window.M.core.dialogue)
			: rej(new Error("moodle-core-notification-dialogue failed to initialize")))));
	return await _moodleDialog;
}

REQUIREJS_PATCHES['moodle-core-notification-dialogue'] = ready => function (this: unknown, ...args) {
	ready.call(this, ...args);
	const Dialog = window.M?.core?.dialogue;
	if (!Dialog) throw new Error("Moodle Dialogue not ready yet!");
	const center = Dialog.prototype.centerDialogOnDialogSizeChange;
	Dialog.prototype.centerDialogOnDialogSizeChange = function (e: { get(key: string): unknown; }) {
		if (e.get('draggable')) return;
		return center.call(this, e);
	};
};
