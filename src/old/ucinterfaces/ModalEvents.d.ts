declare enum _ModalEvents {
	shown,
	hidden,
	destroyed,
	bodyRendered,
	outsideClick,
	save,
	cancel,
}

export type ModalEvents = Record<keyof typeof _ModalEvents, string>;
export = ModalEvents;
