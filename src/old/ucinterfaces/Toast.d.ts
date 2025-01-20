export default interface Toast {
	add(message: string | Promise<string>, configuration: Partial<{
		type: 'info' | 'success' | 'danger' | 'warning',
		closeButton: boolean,
		autohide: boolean,
		delay: number,
		title: string,
		subtitle: string,
	}> = {
		type: 'info',
		closeButton: false,
		autohide: true,
		delay: 4000,
	}): Promise<void>,
	addToastRegion(parent: HTMLElement): Promise<void>,
}
