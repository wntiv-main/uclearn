interface ToastConfig {
	/* The message type, influencing the icon shown and color of the toast. Default: 'info' */
	type?: 'info' | 'success' | 'danger' | 'warning';
	/* Whether a button to close the toast should be provided. Default: false */
	closeButton?: boolean;
	/* Whether the toast will automatically hide after a set amount of time (see: `.delay`). Default: true */
	autohide?: boolean;
	/* The delay in milliseconds after which to automatically hide the toast (see: `.autohide`). Default: 4000 */
	delay?: number;
	/* The (optional) title of the toast, appearing above the message. Default: undefined */
	title?: string;
	/* The (optional) subtitle of the toast, appearing below the title. Default: undefined */
	subtitle?: string;
}

export default interface Toast {
	add(message: string | Promise<string>, configuration: ToastConfig = {
		type: 'info',
		closeButton: false,
		autohide: true,
		delay: 4000,
	}): Promise<void>;
	addToastRegion(parent: Element): Promise<void>;
	removeToastRegion(parent: Element, newParent: Element = document): Promise<void>;
}
