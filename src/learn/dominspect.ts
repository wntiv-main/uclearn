import hljs from 'highlight.js/lib/core';
import hjxml from 'highlight.js/lib/languages/xml';
import hjjs from 'highlight.js/lib/languages/javascript';
import { Hirschberg } from '../global/hirschberg';
import { compareClasses } from './domutil';
import { js_beautify } from 'js-beautify';
import { EXT_URL } from './constants';
import { zip } from '../global/util';

hljs.registerLanguage('xml', hjxml);
hljs.registerLanguage('javascript', hjjs);

export class DOMInspector {
	static #window: WindowProxy | null = null;
	static #domSelector: HTMLElement | null = null;
	static debugging: Set<Node> = new Set();
	#nodeMap: Map<Node, Element> = new Map();
	#reverseMap: Map<Element, Node> = new Map();
	#rootNode: HTMLElement;// HTMLDialogElement;
	#rootSourceNode: Element;
	#tags: Set<string> = new Set();

	constructor (root: Element) {
		this.#rootSourceNode = root;
		this.#rootNode = document.createElement('div');// document.createElement('dialog');
		this.#rootNode.classList.add('uclearn-dom-inspector');
		// const closeForm = document.createElement('form');
		// closeForm.method = 'dialog';
		// closeForm.classList.add('uclearn-dialog-close');
		// const closeButton = document.createElement('button');
		// closeButton.autofocus = true;
		// closeButton.innerHTML = CLOSE_SVG;
		// closeForm.append(closeButton);
		// this.#rootNode.append(closeForm);
		this.#renderTo(root, this.#rootNode);
		// document.body.append(this.#rootNode);
	}

	static #nodesEqual(left: Node, right: Node) {
		if (DOMInspector.#isElement(left) && DOMInspector.#isElement(right)) {
			const dist = (left as HTMLElement).innerText === (right as HTMLElement).innerText ? 0 : 1;//[...zip([...(left as HTMLElement).innerText], [...(right as HTMLElement).innerText])].reduce((a, b) => a + (b[0] === b[1] ? 0 : 1), 0);//LevenshteinDistance([...left.textContent!], [...right.textContent!], (a, b) => a === b);
			return (left.tagName === right.tagName && compareClasses(left.classList, right.classList) ? 1 : 0)
				- dist * 0.5 / Math.max((left as HTMLElement).innerText.length, (right as HTMLElement).innerText.length);
		}
		if (DOMInspector.#isText(left) && DOMInspector.#isText(right)) {
			// return left.data === right.data;
			return [...zip(left.data, right.data)].reduce((a, b) => a + (b[0] === b[1] ? 1 : 0), 0) / Math.max(left.data.length, right.data.length);
		}
		return false;
	}

	static #hydrate(node: Element, from: Element | DocumentFragment) {
		let nextNode = node.firstChild;
		for (const [old, updated] of zip(...Hirschberg([...node.childNodes], [...from.childNodes], DOMInspector.#nodesEqual))) {
			if (old) nextNode = old.nextSibling;
			if (old && !updated || (old && updated && old.nodeType !== updated.nodeType)) {
				if (DOMInspector.#isElement(old)) {
					old.classList.add('hydrate-removed');
				} else if (DOMInspector.#isText(old)) {
					const wrapper = node.ownerDocument.createElement('span');
					wrapper.classList.add('hydrate-removed');
					wrapper.textContent = old.data;
					old.replaceWith(wrapper);
				} else console.warn('unhandled node removal:', old);
			}
			if (!old && updated || (old && updated && old.nodeType !== updated.nodeType)) {
				let newNode: Node;
				if (DOMInspector.#isElement(updated)) {
					newNode = node.ownerDocument.importNode(updated);
					(newNode as Element).classList.add('hydrate-inserted');
				} else if (DOMInspector.#isText(updated)) {
					newNode = node.ownerDocument.createElement('span');
					(newNode as Element).classList.add('hydrate-inserted');
					newNode.textContent = updated.data;
				} else {
					console.warn('unhandled node insertion:', updated);
					continue;
				}
				node.insertBefore(newNode, nextNode);
			}
			if (old && updated && old.nodeType === updated.nodeType) {
				if (DOMInspector.#isElement(old) && DOMInspector.#isElement(updated)) {
					if (old.innerHTML === updated.innerHTML) continue;
					DOMInspector.#hydrate(old, updated);
				} else if (DOMInspector.#isText(old) && DOMInspector.#isText(updated)) {
					DOMInspector.#hydrateText(old, updated);
				}
			}
		}
	}

	static #hydrateText(old: Text, updated: Text) {
		if (old.data === updated.data) return;
		if (old.data.length + updated.data.length > 500) {
			const wrapper = old.ownerDocument.createElement('span');
			wrapper.classList.add('hydrate-updated');
			wrapper.textContent = updated.data;
			old.replaceWith(wrapper);
			return;
		}
		const els = [];
		let added = '';
		let removed = '';
		let unchanged = '';
		for (const [left, right] of zip(...Hirschberg([...old.data], [...updated.data]))) {
			if (unchanged && left !== right) {
				const wrapper = old.ownerDocument.createElement('span');
				wrapper.classList.add('hydrate-unchanged');
				wrapper.textContent = unchanged;
				els.push(wrapper);
				unchanged = '';
			}
			if (added && (right == null || left === right)) {
				const wrapper = old.ownerDocument.createElement('span');
				wrapper.classList.add('hydrate-inserted');
				wrapper.textContent = added;
				els.push(wrapper);
				added = '';
			}
			if (removed && (left == null || left === right)) {
				const wrapper = old.ownerDocument.createElement('span');
				wrapper.classList.add('hydrate-removed');
				wrapper.textContent = removed;
				els.push(wrapper);
				removed = '';
			}
			if (left && left === right) {
				unchanged += left;
			} else {
				if (left) removed += left;
				if (right) added += right;
			}
		}
		if (unchanged) {
			const wrapper = old.ownerDocument.createElement('span');
			wrapper.classList.add('hydrate-unchanged');
			wrapper.textContent = unchanged;
			els.push(wrapper);
		}
		if (added) {
			const wrapper = old.ownerDocument.createElement('span');
			wrapper.classList.add('hydrate-inserted');
			wrapper.textContent = added;
			els.push(wrapper);
		}
		if (removed) {
			const wrapper = old.ownerDocument.createElement('span');
			wrapper.classList.add('hydrate-removed');
			wrapper.textContent = removed;
			els.push(wrapper);
		}
		old.replaceWith(...els);
	}

	showDocumentHighlight(node: Node) {
		if (DOMInspector.#isText(node)) {
			const range = node.ownerDocument.createRange();
			range.selectNode(node);
			this.#showDocumentHighlight(range.getBoundingClientRect());
		} else if (DOMInspector.#isElement(node)) {
			this.#showDocumentHighlight(node.getBoundingClientRect());
		} else if (DOMInspector.#isComment(node)) {
			this.clearDocumentHighlight();
		}
	}

	clearDocumentHighlight() {
		if (DOMInspector.#domSelector)
			DOMInspector.#domSelector.style.display = 'none';
	}

	#showDocumentHighlight(rect: DOMRect) {
		DOMInspector.#domSelector ??= (() => {
			const highlight = document.createElement('div');
			highlight.id = "uclearn-inspector-highlight";
			document.body.append(highlight);
			return highlight;
		})();
		DOMInspector.#domSelector.style.display = 'block';
		DOMInspector.#domSelector.style.inset = `${rect.top}px ${window.innerWidth - rect.right}px ${window.innerHeight - rect.bottom}px ${rect.left}px`;
	}

	open() {
		DOMInspector.#window ??= (() => {
			const win = window.open('about:blank', 'domInspector', 'popup=1');
			if (!win) throw new Error("Could not open popup window");
			const css = win.document.createElement('link');
			css.rel = 'stylesheet';
			css.href = `${EXT_URL}/learn/inspector.css`;
			const hjsCss = win.document.createElement('link');
			hjsCss.rel = 'stylesheet';
			hjsCss.href = `${EXT_URL}/learn/highlight.js/vs2015.css`;
			win.document.head.append(css, hjsCss);
			win.addEventListener('beforeunload', () => {
				this.#rootNode = document.adoptNode(this.#rootNode);
				DOMInspector.#window = null;
			});
			window.addEventListener('beforeunload', () => win.close());
			return win;
		})();
		if (this.#rootNode.ownerDocument !== DOMInspector.#window.document) {
			const stolenNode = DOMInspector.#window?.document.adoptNode(
				this.#rootNode,
			);
			stolenNode.addEventListener(
				"dblclick",
				(e) => {
					const script = (e.target as Element).closest(".scriptable");
					if (script) {
						script.innerHTML = hljs.highlight(
							js_beautify((script as HTMLElement).innerText?.trim() ?? "", {
								indent_with_tabs: true,
								preserve_newlines: true,
								max_preserve_newlines: 2,
								space_before_conditional: true,
								unescape_strings: true,
								jslint_happy: true,
								end_with_newline: false,
								operator_position: "after-newline",
							}),
							{ language: "javascript" },
						).value;
						script.classList.remove("scriptable");
						script.classList.add("scripted");
					} else {
						const node = (e.target as Element).closest(".item");
						if (!node) return;
						node.classList.toggle("debugging");
						// biome-ignore lint/style/noNonNullAssertion: <explanation>
						const srcNode = this.#reverseMap.get(node)!;
						if (!DOMInspector.debugging.delete(srcNode)) {
							DOMInspector.debugging.add(srcNode);
						}
					}
				},
				{ capture: true },
			);
			stolenNode.addEventListener(
				"click",
				(e) => {
					const summary = (e.target as Element).closest("summary");
					if (!summary) return;
					const details = summary.parentElement;
					if (!details || !details.classList.contains("expandable")) return;
					this.#renderChildrenFor(details);
				},
				{ capture: true },
			);
			stolenNode.addEventListener(
				"mouseenter",
				(e) => {
					const item = (e.target as Element).closest(".item");
					if (!item || /removed(?:\s|$)/.test(item.className)) {
						this.clearDocumentHighlight();
						return;
					}
					const highlightEl = this.#reverseMap.get(item);
					if (highlightEl) this.showDocumentHighlight(highlightEl);
				},
				{ capture: true },
			);
			stolenNode.addEventListener(
				"mouseleave",
				(e) => {
					if (!(e.target as Element)?.classList.contains("item")) return;
					let hovered = DOMInspector.#window?.document.elementFromPoint(
						(e as MouseEvent).clientX,
						(e as MouseEvent).clientY,
					);
					if (
						hovered === e.target ||
						(hovered && (e.target as Element)?.contains(hovered))
					)
						hovered = (e.target as Element).parentElement;
					hovered = hovered?.closest(".item");
					if (!hovered || /removed(?:\s|$)/.test(hovered.className)) {
						this.clearDocumentHighlight();
						return;
					}
					const highlightEl = this.#reverseMap.get(hovered);
					if (highlightEl) this.showDocumentHighlight(highlightEl);
				},
				{ capture: true },
			);
			this.#rootNode = stolenNode;
		}
		const filter = document.createElement('input');
		filter.classList.add('filter-input');
		filter.addEventListener('input', () => {
			const oldEls = this.#rootNode.getElementsByClassName('filter-selected');
			while (oldEls.length) {
				oldEls[0].classList.remove('filter-selected');
			}
			if (!filter.value) return;
			let matching: Iterable<Element>;
			try {
				matching = this.#rootSourceNode.querySelectorAll(filter.value);
			} catch {
				matching = [];
			}
			for (const el of matching) {
				this.#renderDirectRouteTo(el);
				const item = this.#nodeMap.get(el);
				if (!item) {
					console.error('no item for node', el);
					continue;
				}
				item.classList.add('filter-selected');
			}
		});
		DOMInspector.#window.document.body.replaceChildren(this.#rootNode, filter);
		DOMInspector.#window.focus();
	}

	commit() {
		for (const tag of this.#tags) {
			const remove = /removed$/.test(tag);
			const elements = this.#rootNode.getElementsByClassName(tag);
			while (elements.length) {
				const el = elements[0];
				el.classList.remove(tag);
				if (remove) {
					const parent = el.parentElement ? this.#nodeMap.get(el.parentElement) : null;
					if (parent && !parent.children.length && (parent.textContent?.length ?? 0) < 50) {
						const newNode = parent.ownerDocument.createElement('div');
						newNode.append(...parent.children);
						newNode.classList.add(...parent.classList, 'collapsed');
						parent.replaceWith(newNode);
						this.#reverseMap.delete(parent);
						// biome-ignore lint/style/noNonNullAssertion: <explanation>
						this.#nodeMap.set(el.parentNode!, newNode);
						// biome-ignore lint/style/noNonNullAssertion: <explanation>
						this.#reverseMap.set(newNode, el.parentNode!);
					}
					el.remove();
				}
			}
		}
		this.#tags.clear();
		for (const added of [
			...this.#rootNode.querySelectorAll(
				":scope :is(.hydrate-inserted, .hydrate-unchanged, .hydrate-updated)",
			),
		]) {
			added.classList.remove('hydrate-inserted', 'hydrate-unchanged', 'hydrate-updated');
			if (!added.classList.length && !added.id) added.replaceWith(...added.childNodes);
		}
		const toRemove = this.#rootNode.getElementsByClassName('hydrate-removed');
		while (toRemove.length) {
			toRemove[0].remove();
		}
	}

	prepareModify(node: Node) {
		this.#renderDirectRouteTo(node);
	}

	insertNode(node: Node, tag = 'item-inserted') {
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		let parent = this.#nodeMap.get(node.parentElement!)!;
		if (!parent) {
			console.warn('inserted into out-of-tree el', node);
			return;
		}
		if (parent.classList.contains('collapsed')) {
			const newNode = parent.ownerDocument.createElement('details');
			newNode.append(...parent.children);
			newNode.classList.add(...parent.classList);
			newNode.classList.remove('collapsed');
			parent.replaceWith(newNode);
			this.#reverseMap.delete(parent);
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			this.#nodeMap.set(node.parentElement!, newNode);
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			this.#reverseMap.set(newNode, node.parentElement!);
			parent = newNode;
		}
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		this.#addTag(this.#renderTo(node, parent, this.#nodeMap.get(node.nextSibling!)!), tag);
	}

	removeNode(node: Node, tag = 'item-removed') {
		const el = this.#nodeMap.get(node);
		if (!el) {
			console.warn('removed out-of-tree el', node);
			return;
		}
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		this.#addTag(this.#nodeMap.get(node)!, tag);
	}

	mutateNode(node: Node, tag = 'item-mutated') {
		const el = this.#nodeMap.get(node);
		if (!el) return;
		if (DOMInspector.#isElement(node)) {
			const outerSrc = node.outerHTML;
			const innerSrc = node.innerHTML;
			const header = outerSrc.slice(0, outerSrc.lastIndexOf('<') - innerSrc.length);
			const headerNode = node.ownerDocument.createElement('span');
			headerNode.innerHTML = hljs.highlight(header, { language: 'xml' }).value;
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			DOMInspector.#hydrate(el.querySelector(':scope>summary')!, headerNode);
		} else if (DOMInspector.#isText(node)) {
			const wrapper = node.ownerDocument.createDocumentFragment();
			wrapper.append(node.ownerDocument.createTextNode(node.data.trim()));
			DOMInspector.#hydrate(el, wrapper);
		} else if (DOMInspector.#isComment(node)) {
			const wrapper = node.ownerDocument.createElement('span');
			const txt = node.data.trim();
			wrapper.innerHTML = txt ? hljs.highlight(`<!-- ${txt} -->`, { language: 'xml' }).value : '';
			DOMInspector.#hydrate(el, wrapper);
		}
		this.#addTag(el, tag);
	}

	hotswapNode(old: Node, replace: Node) {
		const reverse = this.#nodeMap.get(old);
		if (!reverse) return;
		this.#nodeMap.delete(old);
		this.#nodeMap.set(replace, reverse);
		this.#reverseMap.set(reverse, replace);
	}

	addTag(node: Node, tag: string) {
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		this.#addTag(this.#nodeMap.get(node)!, tag);
	}

	#addTag(el: Element, tag: string) {
		this.#tags.add(tag);
		el.classList.add(tag);
	}

	static #isElement(node: Node): node is Element { return node.nodeType === Node.ELEMENT_NODE; }
	static #isText(node: Node): node is Text { return node.nodeType === Node.TEXT_NODE; }
	static #isComment(node: Node): node is Comment { return node.nodeType === Node.COMMENT_NODE; }

	#renderTo(sourceNode: Node, renderNode: Element, before: Element | null = null) {
		// biome-ignore lint/style/noNonNullAssertion: checked
		if (this.#nodeMap.has(sourceNode)) return this.#nodeMap.get(sourceNode)!;
		let structureNode: HTMLElement;
		let isCollapsedElement = false;
		if (DOMInspector.#isText(sourceNode)) {
			structureNode = renderNode.ownerDocument.createElement('div');
			structureNode.classList.add('item', 'text');
			if (sourceNode.parentElement?.tagName === "SCRIPT") structureNode.classList.add('scriptable');
			const txt = sourceNode.data?.trim();
			if (!txt) structureNode.classList.add('empty');
			structureNode.innerText = txt;
		} else if (DOMInspector.#isElement(sourceNode)) {
			const outerSrc = sourceNode.outerHTML;
			const innerSrc = sourceNode.innerHTML;
			const header = outerSrc.slice(0, outerSrc.lastIndexOf('<') - innerSrc.length);
			isCollapsedElement = !sourceNode.children.length && (sourceNode.textContent?.length ?? 0) < 50;
			structureNode = renderNode.ownerDocument.createElement(isCollapsedElement ? 'div' : 'details');
			structureNode.classList.add('item');
			if (isCollapsedElement) structureNode.classList.add('collapsed');
			else structureNode.classList.add('expandable');
			const headerNode = renderNode.ownerDocument.createElement('summary');
			headerNode.innerHTML = hljs.highlight(header, { language: 'xml' }).value;
			structureNode.append(headerNode);
		} else if (DOMInspector.#isComment(sourceNode)) {
			structureNode = renderNode.ownerDocument.createElement('div');
			structureNode.classList.add('item', 'comment');
			const txt = sourceNode.data.trim();
			structureNode.innerHTML = txt ? hljs.highlight(`<!-- ${txt} -->`, { language: 'xml' }).value : '';
		} else throw console.warn('Unhandled in inspect', sourceNode);
		if (DOMInspector.debugging.has(sourceNode))
			structureNode.classList.add('debugging');
		this.#nodeMap.set(sourceNode, structureNode);
		this.#reverseMap.set(structureNode, sourceNode);
		renderNode.insertBefore(structureNode, before);
		if (isCollapsedElement) this.#renderChildrenFor(structureNode);
		return structureNode;
	}

	#renderChildrenFor(structureNode: Element) {
		structureNode.classList.remove('expandable');
		const sourceNode = this.#reverseMap.get(structureNode) as Element;
		for (const node of sourceNode.childNodes) {
			this.#renderTo(node, structureNode);
		}
	}

	#renderDirectRouteTo(sourceNode: Node) {
		if (this.#nodeMap.has(sourceNode)) return;
		if (!this.#rootSourceNode.contains(sourceNode)) {
			console.warn('Element', sourceNode, 'not contained in tree from', this.#rootSourceNode);
			return;
		}
		if (!sourceNode.parentElement) return; //???
		this.#renderDirectRouteTo(sourceNode.parentElement);
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		const parent = this.#nodeMap.get(sourceNode.parentElement)!;
		this.#renderChildrenFor(parent);
	}
}
