import type { ExtendIf } from "./util";

export enum HydrationNodeType {
	ELEMENT = 0,
	TEXT = 1,
	OTHER = 2,
}

export enum HydrationElementType {
	NORMAL = 0,
	SCRIPT = 1,
	VIDEOJS = 2,
}

export enum HydrationTextType {
	NORMAL = 0,
	MATH = 1,
}

export type HydrationNode = { nodeId: number; } & (({
	type: HydrationNodeType.ELEMENT;
	tag: string;
	id: string;
	rawId: string;
	classes: string[];
	attributes: Map<string, string>;
	content: string;
	debugging?: boolean;
	skipUpdate?: boolean;
} & ({
	elementType: HydrationElementType.NORMAL;
} | {
	elementType: HydrationElementType.SCRIPT;
} | {
	elementType: HydrationElementType.VIDEOJS;
	sources: string[];
})) | {
	type: HydrationNodeType.TEXT;
	textType: HydrationTextType;
	content: string;
} | {
	type: HydrationNodeType.OTHER;
});

export type HydrationElement = Extract<HydrationNode, { type: HydrationNodeType.ELEMENT; }>;

export type WHydrationNode = ExtendIf<HydrationNode, { type: HydrationNodeType.ELEMENT; }, { children: PromiseLike<WHydrationNode[]>; }>;

export type WHydrationConfig = {
	needsCourseIndexRefresh?: boolean;
};

export enum PartialHydrationStage {
	HYDRATING = 0,
	APPLYING = 1,
}

export type HydrationStages = number[];
export function precomputeStages(stages: HydrationStages): _HydrationStages {
	const total = stages.reduce((a, b) => a + b);
	return stages.reduce(([running, arr], b) => {
		return [running + b / total, [...arr, [running, b / total]]] as [number, [number, number][]];
	}, [0, []] as [number, [number, number][]])[1];
}
export type _HydrationStages = [pre: number, current: number][];
export type HydrationStage = 'fetching' | 'parsing' | { stage: number & keyof HydrationStages, partial: PartialHydrationStage; } | 'closed';

export type HydrationProgressCallback = (stage: PartialHydrationStage, percentage: number) => void;

export type HydrationConfig = WHydrationConfig & {
	updateUpTree?: boolean;
	evadeDebugging?: boolean;
	nameHint: string;
	signal?: AbortSignal;
	onProgress?: HydrationProgressCallback;
};
export type HydrationTasks = ({ debug?: boolean; } & ({
	type: 'setAttr',
	element: HydrationNode['nodeId'],
	attr: string,
	value: string,
} | {
	type: 'delAttr',
	element: HydrationNode['nodeId'],
	attr: string,
} | {
	type: 'updateContent',
	element: HydrationNode['nodeId'],
	text: string,
} | {
	type: 'remove',
	element: HydrationNode['nodeId'],
} | {
	type: 'insert',
	parent: HydrationNode['nodeId'],
	element: HydrationNode['nodeId'],
	after: HydrationNode['nodeId'] | null,
}))[];
export type HydrationId = number;

export type D2WMessage = {
	type: 'hydrate';
	hydrationId: HydrationId;
	parent: [HydrationElement, HydrationElement];
	children: [HydrationNode[], HydrationNode[]];
	config: WHydrationConfig;
} | {
	type: 'hydrateChildren';
	hydrationId: HydrationId;
	nodeId: HydrationNode['nodeId'];
	children: HydrationNode[];
} | {
	type: 'abort';
	hydrationId: HydrationId;
};

export type W2DMessage = {
	type: 'ready';
} | {
	type: 'tasks';
	hydrationId: HydrationId;
	tasks: HydrationTasks;
} | {
	type: 'requestChildren';
	hydrationId: HydrationId;
	nodeId: HydrationNode['nodeId'];
} | {
	type: 'visited';
	hydrationId: HydrationId;
	nodeId: HydrationNode['nodeId'];
} | {
	type: 'visitedAll';
	hydrationId: HydrationId;
	nodeId: HydrationNode['nodeId'];
} | {
	type: 'alias';
	id: string;
	alias: string;
};
