import { DEBUG } from "../global/constants";
import { assertNever, type ItemOf } from "../global/util";
import { isElementTag } from "./domutil";
import { onNodeInsert, onNodeUpdate } from "./hydration";

const themeListeners: ((theme: NonNullable<'light' | 'dark'>) => void)[] = [];
export function onThemeChange(cb: ItemOf<typeof themeListeners>) {
	themeListeners.push(cb);
	return () => {
		const idx = themeListeners.indexOf(cb);
		if (idx < 0) return;
		themeListeners.splice(idx, 1);
	};
}

export function _setTheme(theme: 'light' | 'dark') {
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

export type ColoredNode = HTMLElement | SVGElement;
type ColoredNodeDetails = {
	color?: string,
	backgroundColor?: string;
	fill?: string;
	stroke?: string;
	ignore: number;
};
const coloredNodes = new Map<ColoredNode, ColoredNodeDetails>();

export function getColoredNodes() {
	return coloredNodes;
}

let _theme: 'light' | 'dark' = 'light';

export function getTheme() {
	return _theme;
}

export function handleColoredNode(el: ColoredNode) {
	const old = coloredNodes.get(el);
	const ensureNew = (value: string | null, old: string | undefined) => value?.startsWith('oklab') ? old ?? value : value || undefined;
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
		el.style.color = `oklab(from ${colors.color} calc(1 - L * 0.5) a b)`;
		colors.ignore++;
	}
	if (colors.backgroundColor) {
		el.style.backgroundColor = `oklab(from ${colors.backgroundColor} calc(1 - L) a b${isElementTag(el, "span") ? "" : " / min(0.4, alpha)"})`;
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

const THEME_PARENTS = '.course-content, .activity-description, .que .content, .post-message';
export const THEMEABLE_SELECTOR = '[style*="color"], [style*="background"], [bgcolor], [stroke]:not(.lucide), [fill]:not(.lucide)';

export function initTheme() {
	onNodeInsert(THEME_PARENTS, THEMEABLE_SELECTOR, handleColoredNode);
	onNodeUpdate(el => handleColoredNode(el as ColoredNode), `:is(${THEME_PARENTS}) :is(${THEMEABLE_SELECTOR})`, ['style', 'bgcolor', 'stroke', 'fill']);

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
}
