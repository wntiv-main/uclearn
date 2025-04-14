import type VideoJS from 'video.js';
import type UCModalRegistry from '../ucinterfaces/ModalRegistry';
import type UCModalEvents from '../ucinterfaces/ModalEvents';
import type UCToast from '../ucinterfaces/Toast';
import type { AceGapfillerUiCtor } from '../ucinterfaces/ace-gapfiller-ui';
import type { PopoverControllerType } from '../ucinterfaces/popover-controller';
import type { NotificationPopoverControllerType } from '../ucinterfaces/notification-popover-controller';

import { onPreHydrate } from "../navigation";
import { getRemappedName, tailHook } from "./patch";
import { HIDDEN_CLS } from '../hydration';

export type ModuleTypesMap = {
	"media_videojs/video-lazy": typeof VideoJS;
	"core/modal_registry": UCModalRegistry;
	"core/modal_events": UCModalEvents;
	"core/toast": UCToast;
	"filter_ace_inline/ace_inline_code": {
		initAceHighlighting(config: unknown & object): PromiseLike<void>;
		initAceInteractive(config: unknown & { button_label: string; }): PromiseLike<void>;
	};
	"block_recentlyaccessedcourses/main": {
		init(userid: number, root: Element): void;
	};
	'vs/editor/editor.main': null;
	'qtype_coderunner/ui_ace_gapfiller': {
		Constructor: AceGapfillerUiCtor;
	};
	'moodle-core-notification-dialogue': undefined;
	'core/popover_region_controller': PopoverControllerType;
	'message_popup/notification_popover_controller': NotificationPopoverControllerType;
	'core_message/message_popover': {
		init(selector: Parameters<JQuery['find']>[0]): void;
	};
	'core_message/message_drawer': {
		init(root: Parameters<JQuery['find']>[0], uniqueId: string, alwaysVisible?: boolean, route?: { params?: string[], path: string; }): void;
	};
};
export type RequireFunctionDeps<T extends (keyof ModuleTypesMap)[]> = { [K in keyof T]: ModuleTypesMap[T[K]] };

export type DefineArgs<K extends keyof ModuleTypesMap = keyof ModuleTypesMap, D extends (keyof ModuleTypesMap)[] = (keyof ModuleTypesMap)[]> =
	| [config: { [key: string]: unknown; }]
	| [func: () => unknown]
	| [ready: (...deps: RequireFunctionDeps<D>) => unknown]
	| [ready: (require: Require, exports: { [key: string]: unknown; }, module: RequireModule) => unknown]
	| [name: K, deps: D, (...deps: RequireFunctionDeps<D>) => ModuleTypesMap[K]]
	| [name: K, () => ModuleTypesMap[K]];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing stub
declare let visibleCoursesId: string | null;

export const REQUIREJS_PATCHES: {
	[K in keyof ModuleTypesMap]?: <Deps extends (keyof ModuleTypesMap)[]>(
		ready: (...deps: RequireFunctionDeps<Deps>) => ModuleTypesMap[K],
		deps: Deps,
		name: K,
		version?: string,
	) => undefined | ((...deps: RequireFunctionDeps<Deps>) => ModuleTypesMap[K])
} = {
	"block_recentlyaccessedcourses/main"(ready, _, name) {
		return tailHook(
			ready,
			() => { onPreHydrate(() => { visibleCoursesId = null; }); },
			{ [getRemappedName(() => onPreHydrate)]: onPreHydrate },
			`<module init: ${name}>`,
		);
	},
	// Preventing duplicate events on hydration
	'core/popover_region_controller'(ready) {
		return function (this: unknown, ...args) {
			const PopoverController = ready.call(this, ...args);
			const _readyBaseListeners = PopoverController.prototype.registerBaseEventListeners;
			PopoverController.prototype.registerBaseEventListeners = function () {
				if (!this.root.hasClass(`${HIDDEN_CLS}-inited`)) _readyBaseListeners.call(this);
			};
			const _readyNavListeners = PopoverController.prototype.registerListNavigationEventListeners;
			PopoverController.prototype.registerListNavigationEventListeners = function () {
				if (!this.root.hasClass(`${HIDDEN_CLS}-inited`)) _readyNavListeners.call(this);
				this.root.addClass(`${HIDDEN_CLS}-inited`);
			};
			return PopoverController;
		};
	},
	'message_popup/notification_popover_controller'(ready) {
		return function (this: unknown, ...args) {
			const NotificationPopoverController = ready.call(this, ...args);
			const _readyListeners = NotificationPopoverController.prototype.registerEventListeners;
			NotificationPopoverController.prototype.registerEventListeners = function () {
				if (!this.root.hasClass(`${HIDDEN_CLS}-inited`)) _readyListeners.call(this);
			};
			return NotificationPopoverController;
		};
	},
	'core_message/message_popover'(ready) {
		return function (this: unknown, ...args) {
			const Popover = ready.call(this, ...args);
			const _init = Popover.init;
			Popover.init = function (selector) {
				if (!$(selector).hasClass(`${HIDDEN_CLS}-inited`)) _init.call(this, selector);
				$(selector).addClass(`${HIDDEN_CLS}-inited`);
			};
			return Popover;
		};
	},
	'core_message/message_drawer'(ready) {
		return function (this: unknown, ...args) {
			const MessageDrawer = ready.call(this, ...args);
			const _init = MessageDrawer.init;
			MessageDrawer.init = function (root, ...args) {
				if (!$(root).hasClass(`${HIDDEN_CLS}-inited`)) _init.call(this, root, ...args);
				$(root).addClass(`${HIDDEN_CLS}-inited`);
			};
			return MessageDrawer;
		};
	},
};
