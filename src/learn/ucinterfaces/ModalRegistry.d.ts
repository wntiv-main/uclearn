import type JQuery from 'jquery';

export interface Modal {
	destroy(): void;
	getRoot(): JQuery<HTMLElement>;
	hide(): void;
	hideFooter(): void;
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
};

interface ModalType<ConfigType> {
	prototype: Modal;
	new(): Modal;
	create(config: ConfigType): PromiseLike<Modal>;
}

type ModalConfig<Buttons extends string> = {
	type?: TYPES,
	title?: string,
	body?: string,
	footer?: string,
	buttons?: Partial<Record<Buttons, string>>,
	isLarge?: boolean,
	isScrollable?: boolean,
	removeOnClose?: boolean,
	templateContext?: unknown,
};

type ModalTypes = {
	DEFAULT: ModalType<ModalConfig<never>>,
	ALERT: ModalType<ModalConfig<never>>,
	CANCEL: ModalType<ModalConfig<"cancel">>,
	SAVE_CANCEL: ModalType<ModalConfig<"save" | "cancel">>,
	DELETE_CANCEL: ModalType<ModalConfig<"delete" | "cancel">>,
	"core/copytoclipboard": ModalType<ModalConfig<never> & { text: string; useTextArea?: boolean; }>,
};

export default interface ModalRegistry {
	get<T extends keyof ModalTypes>(type: T): { module: ModalTypes[T], template: string; };
	register<T>(type: string, module: ModalType<T>, template: string): void;
}
