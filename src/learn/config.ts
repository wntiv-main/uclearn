import { EXT_URL } from "./constants";
import { DatabaseHandler, type DBStoreValue, type KeyValue, type WithKeyPath } from "./db";
import { onNodeInsert, onNodeUpdate, SKIP_HYDRATION_CLASS } from "./hydration";
import { HELP_ICON, MONITOR_ICON, MOON_ICON, SETTINGS_ICON, SUN_ICON, UPLOAD_ICON } from "./icons";
import { getRequire, getYUIInstance, requireModule } from "./patches/lib-hook";
import type monaco from "monaco-editor";
import { DO_HYDRATION, onPostHydrate } from "./navigation";
import { assertNever, chainIter, type ItemOf } from "../global/util";
import { DEBUG } from "../global/constants";
import { getMoodleDialog } from "./patches/yui-modal";
import { Marked } from "marked";
import { baseUrl } from "marked-base-url";
import { isElement, isElementTag } from "./domutil";

type Config = {
	userCss: string;
	customBg: Blob | null;
	theme: 'light' | 'dark' | null;
	hasSeenHelpMenu: boolean;
	performHydration: boolean;
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

const themeListeners: ((theme: NonNullable<Config['theme']>) => void)[] = [];
export function onThemeChange(cb: ItemOf<typeof themeListeners>) {
	themeListeners.push(cb);
	return () => {
		const idx = themeListeners.indexOf(cb);
		if (idx < 0) return;
		themeListeners.splice(idx, 1);
	};
}

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
		switch (value) {
			case 'light':
			case 'dark':
				_setTheme(value);
				break;
			default: {
				const media = window.matchMedia('(prefers-color-scheme: dark)');
				const listener = () => _setTheme(media.matches ? 'dark' : 'light');
				_setTheme(media.matches ? 'dark' : 'light');
				media.addEventListener('change', listener);
				return () => media.removeEventListener('change', listener);
			}
		}
	},
	hasSeenHelpMenu() { },
	performHydration(value) {
		DO_HYDRATION.value = value;
	},
};

function _setTheme(theme: 'light' | 'dark') {
	document.documentElement.classList.remove('uclearn-light-mode', 'uclearn-dark-mode');
	switch (theme) {
		case 'light':
			document.documentElement.classList.add('uclearn-light-mode');
			for (const el of document.getElementsByClassName('navbar-dark')) {
				el.classList.add('navbar-light');
				el.classList.remove('navbar-dark');
			}
			break;
		case 'dark':
			document.documentElement.classList.add('uclearn-dark-mode');
			for (const el of document.getElementsByClassName('navbar-light')) {
				el.classList.add('navbar-dark');
				el.classList.remove('navbar-light');
			}
			break;
		default: assertNever(theme);
	}
	for (const handler of themeListeners) handler(theme);
}

type ColoredNode = HTMLElement | SVGElement;
type ColoredNodeDetails = {
	color?: string,
	backgroundColor?: string;
	fill?: string;
	stroke?: string;
	ignore: number;
};
const coloredNodes = new Map<ColoredNode, ColoredNodeDetails>();

let _theme: 'light' | 'dark' = 'light';
function handleColoredNode(el: ColoredNode) {
	const old = coloredNodes.get(el);
	const ensureNew = (value: string | null, old: string | undefined) => value?.startsWith('oklab(from') ? old ?? value : value || undefined;
	const details = {
		color: ensureNew(el.style.color, old?.color),
		backgroundColor: ensureNew(el.style.backgroundColor || el.getAttribute("bgcolor"), old?.backgroundColor),
		fill: ensureNew(el.getAttribute("fill"), old?.fill),
		stroke: ensureNew(el.getAttribute("stroke"), old?.stroke),
		ignore: 0,
	} satisfies ColoredNodeDetails;
	coloredNodes.set(el, details);
	if (_theme === 'dark') colorNode(el, details);
}

function colorNode(el: ColoredNode, colors: ColoredNodeDetails) {
	if (colors.color) {
		el.style.color = `oklab(from ${colors.color} calc(1 - L) a b)`;
		colors.ignore++;
	}
	if (colors.backgroundColor) {
		el.style.backgroundColor = `oklab(from ${colors.backgroundColor} calc(1 - L) a b${isElementTag(el, "span") ? "" : " / 0.4"})`;
		colors.ignore++;
	}
	if (colors.fill) {
		el.setAttribute("fill", `oklab(from ${colors.fill} calc(1 - L * 0.5) a b)`);
		colors.ignore++;
	}
	if (colors.stroke) {
		el.setAttribute("stroke", `oklab(from ${colors.stroke} calc(1 - L * 0.5) a b)`);
		colors.ignore++;
	}
	if (DEBUG && !el.closest('svg')) {
		el.style.border = '1px solid red';
		colors.ignore++;
	}
}

const THEME_PARENTS = '.course-content, .activity-description, .que .content, [id^="JSXGraph"], .post-message';
const THEMEABLE = '[style*="color"], [style*="background"], [bgcolor], [stroke]:not(.lucide), [fill]:not(.lucide)';

onNodeInsert(THEME_PARENTS, THEMEABLE, handleColoredNode);
onNodeUpdate(el => handleColoredNode(el as ColoredNode), `:is(${THEME_PARENTS}) :is(${THEMEABLE})`, ['style', 'bgcolor', 'stroke', 'fill']);

const jsxGraphObserver = new MutationObserver(evts => {
	for (const e of evts) {
		if (e.type === 'childList') for (const el of chainIter(e.addedNodes)) {
			if (!isElement(el)) continue;
			if (el.matches(THEMEABLE)) handleColoredNode(el as ColoredNode);
			for (const node of el.querySelectorAll<ColoredNode>(THEMEABLE))
				handleColoredNode(node);
		}
		else if (isElement(e.target)) {
			if (e.target.matches(THEMEABLE)) {
				const details = coloredNodes.get(e.target as ColoredNode);
				if (details?.ignore) details.ignore--;
				else handleColoredNode(e.target as ColoredNode);
			} else coloredNodes.delete(e.target as ColoredNode);
		}
	}
});
onNodeInsert(null, '[id^="JSXGraph"]', el => {
	jsxGraphObserver.observe(el, {
		childList: true,
		subtree: true,
		attributeFilter: ['stroke', 'fill', 'style', 'bgcolor'],
	});
	// TODO: memory leaks here?
});

onThemeChange(theme => {
	_theme = theme;
	if (theme === 'dark') {
		const toRemove: ColoredNode[] = [];
		for (const [el, details] of coloredNodes.entries()) {
			if (!document.body.contains(el)) {
				toRemove.push(el);
				continue;
			}
			colorNode(el, details);
		}
		for (const remove of toRemove) coloredNodes.delete(remove);
	} else {
		const toRemove: ColoredNode[] = [];
		for (const [el, colors] of coloredNodes.entries()) {
			if (!document.body.contains(el)) {
				toRemove.push(el);
				continue;
			}
			if (colors.color) {
				el.style.color = colors.color;
				colors.ignore++;
			}
			if (colors.backgroundColor) {
				el.style.backgroundColor = colors.backgroundColor;
				colors.ignore++;
			}
			if (colors.fill) {
				el.setAttribute("fill", colors.fill);
				colors.ignore++;
			}
			if (colors.stroke) {
				el.setAttribute("stroke", colors.stroke);
				colors.ignore++;
			}
		}
		for (const remove of toRemove) coloredNodes.delete(remove);
	}
});

export function getTheme() {
	return _theme;
}

const destructors: Partial<Record<keyof Config, () => void>> = {};
async function initConfigValue<K extends keyof Config>(key: K, value: Config[K]) {
	configCache[key] = value;
	destructors[key]?.();
	destructors[key] = await configHandlers[key](value) ?? undefined;
}

async function setConfigValue<K extends keyof Config>(key: K, value: Config[K]) {
	initConfigValue(key, value);
	const store = await uclearnDB.openStore('userConfig', 'readwrite');
	store.put({ key, value } as never);
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
		await setConfigValue('userCss', cssSrc);
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
	let reloadOnExit = false;
	const Dialog = await getMoodleDialog();
	const form = document.createElement("form");
	form.id = 'uclearn-settings-form';

	const featureToggles = document.createElement('fieldset');
	featureToggles.classList.add('uclearn-feature-toggles');
	const featuresLegend = document.createElement('legend');
	featuresLegend.textContent = 'Features';
	featureToggles.append(featuresLegend);
	const featureTable = document.createElement('table');
	const featureTBody = document.createElement('tbody');
	featureTBody.append(...([
		[
			'Hydration',
			(value) => setConfigValue('performHydration', value),
			() => DO_HYDRATION.value,
		],
		[
			'Math Fields',
			(value) => { reloadOnExit = true; },
			() => true,
		],
		[
			'Python LSP',
			(value) => { reloadOnExit = true; },
			() => true,
		]
	] satisfies [name: string, toggle: (value: boolean) => unknown, value: () => boolean][]).map(([name, toggle, value]) => {
		const id = name.toLowerCase().replaceAll(/\W/g, '-');
		const row = document.createElement('tr');
		const labelCell = document.createElement('th');
		const label = document.createElement('label');
		label.textContent = name;
		labelCell.append(label);
		const toggleCell = document.createElement('td');
		const toggler = document.createElement('div');
		toggler.title = name;
		toggler.classList.add('custom-control', 'custom-switch');
		const toggleInput = document.createElement('input');
		toggleInput.type = 'checkbox';
		toggleInput.classList.add('custom-control-input');
		toggleInput.checked = value();
		toggleInput.addEventListener('change', function () { toggle(this.checked); });
		toggleInput.name = toggleInput.id = `__uclearn-feature-toggle-${id}`;
		const toggleLabel = document.createElement('label');
		toggleLabel.classList.add('custom-control-label');
		toggleLabel.setAttribute('for', toggleInput.name);
		label.setAttribute('for', toggleInput.name);
		toggler.append(toggleInput, toggleLabel);
		toggleCell.append(toggler);
		row.append(labelCell, toggleCell);
		return row;
	}));
	featureTable.append(featureTBody);
	featureToggles.append(featureTable);

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
				setConfigValue('customBg', img.src);
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
				setConfigValue('customBg', file);
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
		radio.addEventListener('change', () => setConfigValue('theme', value));
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
			run: () => {
				const value = editor.getValue();
				setConfigValue('userCss', value);
			}
		});
	});
	const cssField = document.createElement('fieldset');
	const cssFieldLabel = document.createElement('legend');
	cssFieldLabel.textContent = 'User CSS';
	cssField.append(cssFieldLabel, cssEditorContainer);
	form.append(featureToggles, backgroundImages, colorTheme, cssField);
	const dialog = new Dialog({
		headerContent: 'MooMo Settings',
		bodyContent: (await getYUIInstance()).one(form),
		draggable: true,
		center: true,
		width: null,
	});
	dialog.applyAndTrapFocus = () => { };
	dialog.trapFocus = () => { };
	dialog.after('visibleChange', () => reloadOnExit && location.reload());
	return dialog;
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

let _configModal: ReturnType<typeof prepareConfigModal> | null = null;
export async function showConfigModal() {
	_configModal ??= prepareConfigModal();
	(await _configModal).show();
}

async function prepareHelpModal() {
	const [Dialog, content] = await Promise.all([getMoodleDialog(), fetch(`${EXT_URL}/learn/help.md`).then(resp => resp.text())]);
	const marked = new Marked(baseUrl(`${EXT_URL}/learn/`));
	const container = document.createElement("div");
	container.id = 'uclearn-help-container';
	const shadow = container.attachShadow({
		mode: 'closed',
	});
	shadow.innerHTML = (await marked.parse(content, {
		gfm: true,
		breaks: false,
	})).replaceAll(EXT_URL.split(':')[1], EXT_URL);
	const header = shadow.querySelector('h1');
	header?.remove();
	return new Dialog({
		headerContent: header?.textContent ?? 'MooMo Help',
		bodyContent: (await getYUIInstance()).one(container),
		draggable: true,
		center: true,
		modal: true,
		width: null,
	});
}

let _helpModal: ReturnType<typeof prepareHelpModal> | null = null;
export async function showHelpModal() {
	_helpModal ??= prepareHelpModal();
	(await _helpModal).show();
}

export async function initConfig() {
	for await (const { key, value } of uclearnDB.iterStore('userConfig')) {
		initConfigValue(key, value);
	}
	if (!('theme' in configCache)) initConfigValue("theme", null);
	const settingsButton = document.createElement('button');
	settingsButton.innerHTML = `${SETTINGS_ICON}MooMo Settings`;
	settingsButton.classList.add('dropdown-item', '__uclearn-settings-button', SKIP_HYDRATION_CLASS);
	settingsButton.addEventListener('click', () => showConfigModal());
	const helpButton = document.createElement('button');
	helpButton.innerHTML = `${HELP_ICON}MooMo Help`;
	helpButton.classList.add('dropdown-item', '__uclearn-help-button', SKIP_HYDRATION_CLASS);
	helpButton.addEventListener('click', () => showHelpModal());
	const installButton = () =>
		document
			.querySelector('#user-action-menu a[href*="preferences"]')
			?.before(settingsButton, helpButton);
	onPostHydrate(installButton);
	if (!configCache.hasSeenHelpMenu) {
		await getRequire(); // Or else modal errors
		await showHelpModal();
		const store = await uclearnDB.openStore('userConfig', 'readwrite');
		store.put({ key: 'hasSeenHelpMenu', value: true });
	}
}
