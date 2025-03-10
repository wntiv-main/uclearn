import { DatabaseHandler, KeyValue, WithKeyPath } from "./db";
import { SKIP_HYDRATION_CLASS } from "./hydration";
import { JSProxy } from "./js-proxy";

type Config = {
	userCss: string;
	customBg: Blob | null;
	theme: 'light' | 'dark' | null;
};

type UCLearnDB = {
	userConfig: WithKeyPath<KeyValue<Config>, 'key'>;
	customBackgrounds: WithKeyPath<{
		id: string,
		src: Blob,
		thumbnail: string,
	}, 'id'>;
};

const uclearnDB = /^(preuc|quiz\d+\.csse)\.canterbury\.ac\.nz$/.test(location.hostname) ? (async () => {
	const frame = document.createElement('iframe');
	frame.classList.add(SKIP_HYDRATION_CLASS);
	document.body.prepend(frame);
	frame.setAttribute('credentialless', 'true');
	frame.src = 'https://learn.canterbury.ac.nz//uclearn-database-host';
	const proxy = new JSProxy<DatabaseHandler<UCLearnDB>>(frame.contentWindow, window, {});
	return proxy.interface;
})() : new DatabaseHandler<UCLearnDB>('__uclearn', [
	db => {
		db.createObjectStore('userConfig', { keyPath: 'key' });
		db.createObjectStore('customBackgrounds', { keyPath: 'id' });
	}
]);
