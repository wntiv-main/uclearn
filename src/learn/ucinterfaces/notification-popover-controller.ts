import { PopoverController } from "./popover-controller";

export interface NotificationPopoverController extends PopoverController {
	markAllReadButton: JQuery;
	unreadCount: number | string;
	lastQueried: number; // Date?
	userId: string;
	container: JQuery;
	limit: number;
	offset: number;
	loadedAll: boolean;
	initialLoad: boolean;

	updateButtonAriaLabel(): void;
	getContent(): JQuery; // Element?
	getOffset(): number;
	incrementOffset(): void;
	hasDoneInitialLoad(): boolean;
	hasLoadedAllContent(): boolean;
	setLoadedAllContent(value: boolean): void;
	renderUnreadCount(): void;
	hideUnreadCount(): void;
	getNotificationElement(id: string): JQuery; // Element?
	renderNotifications(): unknown; // Promise?
	loadMoreNotifications(): PromiseLike<unknown>;
	markAllAsRead(): PromiseLike<unknown>;
	registerEventListeners(): void;
}

export type NotificationPopoverControllerType = {
	new(): NotificationPopoverController;
	prototype: NotificationPopoverController;
};
