import { EXT_URL } from "./constants";
import { DatabaseHandler, type DBStoreValue, type KeyValue, type WithKeyPath } from "./db";
import { SKIP_HYDRATION_CLASS } from "./hydration";
import { MONITOR_ICON, MOON_ICON, SETTINGS_ICON, SUN_ICON, UPLOAD_ICON } from "./icons";
import { getRequire, getYUIInstance, requireModule } from "./lib-hook";
import type monaco from "monaco-editor";
import { onPostHydrate } from "./navigation";

type Config = {
	userCss: string;
	customBg: Blob | null;
	theme: 'light' | 'dark' | null;
};

const uclearnDB = new DatabaseHandler<{
	userConfig: WithKeyPath<KeyValue<Config>, 'key'>;
	customBackgrounds: WithKeyPath<{
		id: string,
		src: Blob,
		thumbnail: string,
	}, 'id'>;
}>('__uclearn', [
	db => {
		db.createObjectStore('userConfig', { keyPath: 'key' });
		db.createObjectStore('customBackgrounds', { keyPath: 'id' });
	}
]);

const CUSTOM_BACKGROUND_PROP = '--uclearn-custom-bg-blob';

const configCache: Partial<Config> = {};

let userCssEditorModel: monaco.editor.ITextModel | null = null;
const configHandlers: {
	[K in keyof Config]: ((value: Config[K]) => void) | ((value: Config[K]) => (() => void) | Promise<() => void>)
} = {
	userCss(src) {
		userCssEditorModel?.setValue(src);
		const css = document.getElementById('uclearn-usercss') as HTMLStyleElement | null ?? (() => {
			const css = document.createElement("style");
			css.id = 'uclearn-usercss';
			css.classList.add(SKIP_HYDRATION_CLASS);
			document.documentElement.prepend(css);
			return css;
		})();
		css.textContent = `:root:root:root:root:root:root:root:root:root:root{${src}}`;
		return () => { css.textContent = ''; };
	},
	customBg(value) {
		if (!value) return;
		const url = URL.createObjectURL(value);
		document.documentElement.style.setProperty(CUSTOM_BACKGROUND_PROP, `url(${JSON.stringify(url)})`);
		return () => {
			URL.revokeObjectURL(url);
			document.documentElement.style.removeProperty(CUSTOM_BACKGROUND_PROP);
		};
	},
	theme(value) {
		document.documentElement.classList.remove('uclearn-light-mode', 'uclearn-dark-mode');
		switch (value) {
			case 'light':
				document.documentElement.classList.add('uclearn-light-mode');
				break;
			case 'dark':
				document.documentElement.classList.add('uclearn-dark-mode');
				break;
			default: {
				const media = window.matchMedia('(prefers-color-scheme: dark)');
				document.documentElement.classList.add(
					media.matches ? 'uclearn-dark-mode' : 'uclearn-light-mode');
				const listener = () => {
					document.documentElement.classList.remove('uclearn-light-mode', 'uclearn-dark-mode');
					document.documentElement.classList.add(
						media.matches ? 'uclearn-dark-mode' : 'uclearn-light-mode');
				};
				media.addEventListener('change', listener);
				return () => media.removeEventListener('change', listener);
			}
		}
	},
};

const destructors: Partial<Record<keyof Config, () => void>> = {};
async function initConfigValue<K extends keyof Config>(key: K, value: Config[K]) {
	configCache[key] = value;
	destructors[key]?.();
	destructors[key] = await configHandlers[key](value) ?? undefined;
}

export async function initConfig() {
	for await (const { key, value } of uclearnDB.iterStore('userConfig')) {
		initConfigValue(key, value);
	}
	if (!('theme' in configCache)) initConfigValue("theme", null);
	const settingsButton = document.createElement('button');
	settingsButton.innerHTML = `${SETTINGS_ICON('height: 1lh;margin-inline: -5px 5px;')}Moodle Mod Settings`;
	settingsButton.classList.add('dropdown-item', SKIP_HYDRATION_CLASS);
	settingsButton.addEventListener('click', () => showConfigModal());
	const installButton = () =>
		document
			.querySelector('#user-action-menu a[href*="preferences"]')
			?.before(settingsButton);
	onPostHydrate(installButton);
	installButton();
}

const toSet: [prop: string, value: string][] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function setCssProp(prop: string, value: string) {
	document.documentElement.style.setProperty(prop, value);
	toSet.push([prop, value]);
	if (!timer) timer = setTimeout(async () => {
		const css = configCache.userCss ?? (await DatabaseHandler.prepare((await uclearnDB.openStore('userConfig', 'readonly')).get('userCss')))?.value;
		let cssSrc = css ?? '';
		for (const [prop, value] of toSet) {
			document.documentElement.style.removeProperty(prop);
			const rx = new RegExp(`(${prop}:.*?;)`);
			const match = cssSrc.split(rx);
			if (match.length > 1) {
				match[1] = `${prop}: ${value};`;
				cssSrc = match.join('');
			} else {
				cssSrc = `${prop}: ${value};\n${cssSrc}`;
			}
		}
		toSet.length = 0;
		const store = await uclearnDB.openStore('userConfig', 'readwrite');
		store.put({ key: 'userCss', value: cssSrc });
		initConfigValue('userCss', cssSrc);
		timer = null;
	}, 300);
}

const BG_IMAGES = [
	{
		label: "Bing Daily Wallpaper",
		src: "https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=en-NZ",
	}
];

async function prepareConfigModal() {
	const Y = await getYUIInstance();
	await new Promise<void>(res => Y.require(['moodle-core-notification-dialogue'], () => res()));
	if (!window.M?.core?.dialogue) return;
	const center = window.M.core.dialogue.prototype.centerDialogOnDialogSizeChange;
	window.M.core.dialogue.prototype.centerDialogOnDialogSizeChange = function (e: { get(key: string): unknown; }) {
		if (e.get('draggable')) return;
		return center.call(this, e);
	};
	const form = document.createElement("form");
	form.id = 'uclearn-settings-form';
	const backgroundImages = document.createElement('fieldset');
	backgroundImages.classList.add('uclearn-bg-select');
	const bgLegend = document.createElement('legend');
	bgLegend.textContent = 'Background Image';
	backgroundImages.append(bgLegend);
	for (const [i, img] of Object.entries([...BG_IMAGES])) {
		const radio = document.createElement('input');
		radio.type = 'radio';
		radio.value = img.src;
		radio.id = `_uclearn-bg-image-config-${i}`;
		radio.name = 'uclearn-bg-select';
		radio.addEventListener('change', () =>
			setCssProp('--uclearn-background-image', `url(${JSON.stringify(img.src)})`));
		const label = document.createElement('label');
		label.setAttribute('for', radio.id);
		label.title = img.label;
		const image = new Image();
		image.src = img.src;
		label.append(image);
		backgroundImages.append(radio, label);
	}
	const customImages = document.createElement('span');
	customImages.classList.add('uclearn-custom-images-container');
	backgroundImages.append(customImages);
	(async () => {
		for await (const img of uclearnDB.iterStore('customBackgrounds')) {
			const radio = document.createElement('input');
			radio.type = 'radio';
			radio.id = `_uclearn-bg-custom-config-${img.id}`;
			radio.name = 'uclearn-bg-select';
			radio.addEventListener('change', () => {
				initConfigValue('customBg', img.src);
				uclearnDB.openStore('userConfig', 'readwrite').then(o => o.put({ key: 'customBg', value: img.src }));
				setCssProp('--uclearn-background-image', `var(${CUSTOM_BACKGROUND_PROP})`);
			});
			const label = document.createElement('label');
			label.setAttribute('for', radio.id);
			label.title = img.id;
			const image = new Image();
			image.src = img.thumbnail;
			label.append(image);
			customImages.append(radio, label);
		}
	})();
	const fileUpload = document.createElement('input');
	fileUpload.type = 'file';
	fileUpload.id = '_uclearn-bg-image-upload';
	fileUpload.accept = 'image/*';
	fileUpload.multiple = true;
	fileUpload.addEventListener('change', async () => {
		const files: DBStoreValue<typeof uclearnDB, 'customBackgrounds'>[] = [];
		for (const file of fileUpload.files ?? []) {
			const id = file.name;
			const radio = document.createElement('input');
			radio.type = 'radio';
			radio.id = `_uclearn-bg-custom-config-${id}`;
			radio.name = 'uclearn-bg-select';
			radio.addEventListener('change', () => {
				initConfigValue('customBg', file);
				uclearnDB.openStore('userConfig', 'readwrite').then(o => o.put({ key: 'customBg', value: file }));
				setCssProp('--uclearn-background-image', `var(${CUSTOM_BACKGROUND_PROP})`);
			});
			const label = document.createElement('label');
			label.setAttribute('for', radio.id);
			label.title = id;
			const image = new Image();
			label.append(image);
			customImages.append(radio, label);
			const tempUrl = URL.createObjectURL(file);
			const completion = new Promise<void>(res => {
				const listener = () => {
					image.removeEventListener('load', listener);
					res();
				};
				image.addEventListener('load', listener);
			});
			image.src = tempUrl;
			await completion;
			const canvas = new OffscreenCanvas(100, Math.ceil(100 * image.naturalHeight / image.naturalWidth));
			const c = canvas.getContext('2d');
			if (!c) throw new Error("Failed to make canvas context");
			c.drawImage(image, 0, 0, canvas.width, canvas.height);
			const reader = new FileReader();
			const blob = await canvas.convertToBlob();
			const thumbnail = await new Promise<string>(res => {
				reader.addEventListener('load', () => res(reader.result as string));
				reader.readAsDataURL(blob);
			});
			image.src = thumbnail;
			URL.revokeObjectURL(tempUrl);

			files.push({ id, src: file, thumbnail });
		}
		fileUpload.value = '';
		const store = await uclearnDB.openStore('customBackgrounds', 'readwrite');
		for (const file of files) store.put(file);
	});
	const label = document.createElement('label');
	label.setAttribute('for', fileUpload.id);
	label.title = 'Upload Image';
	label.innerHTML = UPLOAD_ICON;
	backgroundImages.append(fileUpload, label);
	const colorTheme = document.createElement('fieldset');
	colorTheme.classList.add('uclearn-color-scheme');
	const themeLegend = document.createElement('legend');
	themeLegend.textContent = "Color Scheme";
	const controller = document.createElement('div');
	controller.classList.add('uclearn-color-scheme-select');
	colorTheme.append(themeLegend, controller);
	for (const [title, value, icon] of [["Light", 'light', SUN_ICON], ["System Scheme", null, MONITOR_ICON], ["Dark", 'dark', MOON_ICON]] as const) {
		const radio = document.createElement('input');
		radio.type = 'radio';
		radio.id = `_uclearn-color-scheme-${value}`;
		radio.name = 'uclearn-color-scheme-select';
		radio.checked = (configCache.theme ?? null) === value;
		radio.addEventListener('change', () => {
			initConfigValue('theme', value);
			uclearnDB.openStore('userConfig', 'readwrite').then(o => o.put({ key: 'theme', value }));
		});
		const label = document.createElement('label');
		label.setAttribute('for', radio.id);
		label.title = title;
		label.innerHTML = icon;
		controller.append(radio, label);
	}
	const [cssEditorContainer, innerEditor, monacoPromise] = initMonaco({
		value: configCache.userCss,
		language: 'css',
		scrollBeyondLastLine: false,
		theme: 'vs-dark',
		minimap: {
			enabled: false,
		},
		scrollbar: {
			alwaysConsumeMouseWheel: false,
		},
	});
	monacoPromise.then(([monaco, editor]) => {
		userCssEditorModel = editor.getModel();
		function handleResize(height: number) {
			innerEditor.style.height = `${Math.min(height, window.innerHeight)}px`;
			editor.layout();
		}
		editor.onDidContentSizeChange((e) => handleResize(e.contentHeight));
		handleResize(editor.getContentHeight());
		editor.addAction({
			id: 'save',
			label: 'Save User CSS',
			keybindings: [
				monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
				monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyS,
			],
			run: async () => {
				const value = editor.getValue();
				initConfigValue('userCss', value);
				const store = await uclearnDB.openStore('userConfig', 'readwrite');
				store.put({ key: 'userCss', value });
			}
		});
	});
	const cssField = document.createElement('fieldset');
	const cssFieldLabel = document.createElement('legend');
	cssFieldLabel.textContent = 'User CSS';
	cssField.append(cssFieldLabel, cssEditorContainer);
	form.append(backgroundImages, colorTheme, cssField);
	return new window.M.core.dialogue({
		headerContent: 'Moodle Mod Settings',
		bodyContent: Y.one(form),
		draggable: true,
		center: true,
		modal: true,
		width: null,
	});
}

type MonacoConfig = NonNullable<Parameters<typeof monaco.editor.create>[1]>;

let _codiconFont: Promise<FontFace> | null = null;
function initMonaco(config?: Omit<MonacoConfig, 'model'> & { model?: (m: typeof monaco) => PromiseLike<MonacoConfig['model']>; }) {
	const path = `${EXT_URL}/learn/vs`;

	const container = document.createElement('div');
	const shadowRoot = container.attachShadow({
		mode: 'closed',
	});

	const innerContainer = document.createElement('div');
	shadowRoot.appendChild(innerContainer);

	const innerStyle = document.createElement('style');
	innerStyle.innerText = `@import ${JSON.stringify(`${path}/editor/editor.main.css`)};`;
	shadowRoot.appendChild(innerStyle);

	return [container, innerContainer, (async () => {
		const require = await getRequire();
		require.config({
			paths: { vs: path },
			'vs/css': { disabled: true }
		} as RequireConfig);

		_codiconFont ??= (async () => {
			const font = new FontFace('codicon',
				`url(${JSON.stringify(`${path}/base/browser/ui/codicons/codicon/codicon.ttf`)
				}) format('truetype')`);
			await font.load();
			document.fonts.add(font);
			return font;
		})();

		await requireModule("vs/editor/editor.main");
		// biome-ignore lint/style/noNonNullAssertion: hope
		const monaco = window.monaco!;
		const cfg = config as MonacoConfig | undefined;
		if (cfg) cfg.model = await config?.model?.(monaco);
		return [monaco, monaco.editor.create(innerContainer, cfg)] as const;
	})()] as const;
}

let _configModal: Awaited<ReturnType<typeof prepareConfigModal>> | null = null;
export async function showConfigModal() {
	_configModal ??= await prepareConfigModal();
	_configModal?.show();
}
