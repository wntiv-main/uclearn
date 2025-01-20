import type JQuery from 'jquery'

declare enum TYPES {
	DEFAULT,
	SAVE_CANCEL,
	CANCEL,
	ALERT,
}

export type Modal = {
	destroy(): void,
	getRoot(): JQuery<HTMLElement>,
	hide(): void,
	hideFooter(): void,
	isLarge(): boolean,
	isSmall(): boolean,
	isVisible(): boolean,
	setBody(value: string): void,
	setButtonText(action: string, value: string): void,
	setFooter(value: string): void,
	setLarge(): void,
	setRemoveOnClose(remove: boolean): void,
	setScrollable(value: boolean): void,
	setSmall(): void,
	setTitle(value: string): void,
	show(): void,
	showFooter(): void,
}

export default interface ModalFactory {
	types: typeof TYPES,
	create(
		modalConfig: {
			type?: TYPES,
			title?: string,
			body?: string,
			footer?: string,
			buttons?: {
				save?: string,
				cancel?: string,
			},
			isLarge?: boolean,
			isScrollable?: boolean,
			removeOnClose?: boolean,
			templateContext?: unknown,
		},
		triggerElement?: HTMLElement
	): PromiseLike<Modal>,
}
