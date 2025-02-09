import { assertNever, map, zip, type Shifted } from '../../global/util';
import { type HydrationElement, HydrationElementType, HydrationNodeType, type HydrationTasks, type D2WMessage, type HydrationNode, type W2DMessage, type WHydrationNode, HydrationConfig, type WHydrationConfig, HydrationTextType, type HydrationId } from '../../global/hydration';
import { Hirschberg } from '../../global/hirschberg';

declare const self: Omit<WorkerGlobalScope & typeof globalThis, 'postMessage'> & {
	postMessage(message: W2DMessage, ...args: Shifted<Parameters<typeof globalThis.postMessage>>): void;
};

function similarClasses(classListA: string[], classListB: string[]) {
	if (!classListA.length) return true;
	for (const cls of classListA) {
		if (classListB.includes(cls)) return true;
	}
	return false;
}

function compare(a: HydrationNode, b: HydrationNode) {
	if (a.type !== b.type) return false;
	switch (a.type) {
		case HydrationNodeType.ELEMENT: {
			if (a.elementType === HydrationElementType.VIDEOJS && (b as typeof a).elementType === HydrationElementType.VIDEOJS) {
				for (const aSrc of a.sources) {
					if ((b as typeof a).sources.includes(aSrc)) return true;
				}
			}
			if (a.tag !== (b as typeof a).tag
				|| a.id !== (b as typeof a).id) return false;
			if (a.elementType === HydrationElementType.SCRIPT
				&& a.content !== (b as typeof a).content
				&& (a.attributes.get('src') !== (b as typeof a).attributes.get('src')
					|| !a.attributes.has('src') || !(b as typeof a).attributes.has('src'))) return false;
			return similarClasses(a.classes, (b as typeof a).classes);
		}
		case HydrationNodeType.TEXT: return a.content === (b as typeof a).content;
		case HydrationNodeType.OTHER: return false;
	}
}

function compareClasses(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	for (const cls of a) {
		if (!b.includes(cls)) return false;
	}
	return true;
}

const SAFE_ATTRS = /^id$|^class$|^data-uclearn/;
function updateNode(tasks: HydrationTasks, dom: HydrationElement, updated: HydrationElement) {
	const newClasses = [...updated.classes];
	if (dom.classes.includes('jsenabled')) newClasses.push('jsenabled');
	if (!compareClasses(dom.classes, newClasses)) {
		tasks.push({
			type: 'setAttr',
			element: dom.nodeId,
			attr: 'class',
			value: newClasses.join(' '),
		});
	}
	if (updated.rawId && dom.rawId !== updated.rawId)
		tasks.push({
			type: 'setAttr',
			element: dom.nodeId,
			attr: 'id',
			value: updated.rawId,
		});
	for (const [name,] of dom.attributes) {
		if (SAFE_ATTRS.test(name)) continue;
		if (!updated.attributes.has(name)) tasks.push({
			type: 'delAttr',
			element: dom.nodeId,
			attr: name,
		});
	}
	for (const [name, value] of updated.attributes) {
		if (SAFE_ATTRS.test(name)) continue;
		if (dom.attributes.get(name) !== value) tasks.push({
			type: 'setAttr',
			element: dom.nodeId,
			attr: name,
			value: value,
		});
	}
}

async function calculateChanges(id: HydrationId, config: WHydrationConfig, tasks: HydrationTasks, dom: HydrationElement & WHydrationNode, updated: HydrationElement & WHydrationNode) {
	// Update current node
	updateNode(tasks, dom, updated);
	self.postMessage({
		type: 'visited',
		hydrationId: id,
		nodeId: dom.nodeId,
	});
	// Update children
	if (dom.content === updated.content) return;
	const diff = zip(...Hirschberg(await dom.children, await updated.children, compare));
	let lastElement: null | HydrationNode['nodeId'] = null;
	if (dom.debugging) {
		console.log([...diff]);
		// biome-ignore lint/suspicious/noDebugger: intentional
		debugger;
	}
	await Promise.all(map(diff, async ([left, right]) => {
		const replaced = left != null
			&& right != null
			&& !compare(left, right);
		if (left && right && !replaced)
			lastElement = left.nodeId;
		if (replaced && left.type === HydrationNodeType.TEXT && left.textType === HydrationTextType.NORMAL
			&& right.type === HydrationNodeType.TEXT && right.textType === HydrationTextType.NORMAL) {
			tasks.push({
				type: 'updateContent',
				element: left.nodeId,
				text: right.content,
			});
			return;
		}
		if (right == null || replaced) {
			if (left == null) throw new Error;
			// Remove
			tasks.push({
				type: 'remove',
				element: left.nodeId,
			});
			self.postMessage({
				type: 'visitedAll',
				hydrationId: id,
				nodeId: left.nodeId,
			});
		}
		if (left == null || replaced) {
			if (right == null) throw new Error;
			// Insert
			tasks.push({
				type: 'insert',
				parent: dom.nodeId,
				element: right.nodeId,
				after: lastElement,
			});
			lastElement = right.nodeId;
		}
		if (left != null && right != null && !replaced) {
			// Update
			if (left.type !== HydrationNodeType.ELEMENT || right.type !== HydrationNodeType.ELEMENT) return;
			if (left.rawId && right.rawId && left.rawId !== right.rawId)
				self.postMessage({ type: 'alias', id: right.rawId, alias: left.rawId });
			if (left.elementType !== HydrationElementType.NORMAL) return;
			if (left.classes.includes('questionflag')) return;
			if (left.id.startsWith('stack-iframe-holder-')) return;
			if (!config.needsCourseIndexRefresh && left.id.includes('drawers-courseindex')) return;
			self.postMessage({ type: 'requestChildren', hydrationId: id, nodeId: left.nodeId });
			self.postMessage({ type: 'requestChildren', hydrationId: id, nodeId: right.nodeId });
			await calculateChanges(id, config, tasks, left, right);
		}
	}));
}

const waitingChildren: Record<HydrationId, Record<HydrationNode['nodeId'], (children: WHydrationNode[]) => void>> = {};

function withChildren(node: HydrationElement, children: Promise<WHydrationNode[]>) {
	const _node = node as WHydrationNode & HydrationElement;
	_node.children = children;
	return _node;
}

function setupChildren(child: HydrationNode, id: HydrationId): WHydrationNode {
	if (child.type === HydrationNodeType.ELEMENT)
		return withChildren(child, new Promise<WHydrationNode[]>(res => {
			waitingChildren[id][child.nodeId] = res;
		}));
	return child;
}

self.addEventListener("message", async (e: MessageEvent) => {
	const msg = e.data as D2WMessage;
	switch (msg.type) {
		case 'hydrate': {
			const tasks: HydrationTasks = [];
			const id = msg.hydrationId;
			waitingChildren[id] = {};
			const [left, right] = msg.parent;
			const [leftChildren, rightChildren] = msg.children;
			await calculateChanges(id, msg.config, tasks,
				withChildren(left, Promise.resolve(
					leftChildren.map(child => setupChildren(child, id)))),
				withChildren(right, Promise.resolve(
					rightChildren.map(child => setupChildren(child, id)))));
			delete waitingChildren[id];
			self.postMessage({
				type: 'tasks',
				hydrationId: id,
				tasks,
			});
			break;
		}
		case 'hydrateChildren':
			waitingChildren[msg.hydrationId]?.[msg.nodeId](
				msg.children.map(child => setupChildren(child, msg.hydrationId)));
			break;
		default:
			assertNever(msg);
	}
});

self.postMessage({ type: 'ready' });
