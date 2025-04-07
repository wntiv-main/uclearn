export interface PopoverController {
	root: JQuery;
	content: JQuery;
	contentContainer: JQuery;
	menuContainer: JQuery;
	menuToggle: JQuery;
	isLoading: boolean;
	promises: Record<string, Promise<unknown>>;
	events(): {
		menuOpened: "popoverregion:menuopened",
		menuClosed: "popoverregion:menuclosed",
		startLoading: "popoverregion:startLoading",
		stopLoading: "popoverregion:stopLoading";
	};
	getContentContainer(): this['contentContainer'];
	getContent(): this['content'];
	isMenuOpen(): boolean;
	toggleMenu(): void;
	closeMenu(): void;
	openMenu(): void;
	updateButtonAriaLabel(): void;
	startLoading(): void;
	stopLoading(): void;
	focusMenuToggle(): void;
	contentItemHasFocus(): boolean;
	getContentItemWithFocus(): JQuery;
	focusContentItem(): void;
	focusFirstContentItem(): void;
	focusLastContentItem(): void;
	focusNextContentItem(): void;
	focusPreviousContentItem(): void;
	registerBaseEventListeners(): void;
	registerListNavigationEventListeners(): void;
	updateFocusItemTabIndex(): void;
}

export type PopoverControllerType = {
	new(): PopoverController;
	prototype: PopoverController;
};
