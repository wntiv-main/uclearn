// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function getRemappedName(accessor: () => any) {
	return accessor.toString().replace(/^\s*(?:\([^)]*\)|\w+)\s*=>\s*(\w+)$|^\s*(?:(?:function\s+\w+|function|\w+)\s*\([^)]*\)|\([^)]*\)\s*=>)\s*{.*return\s+(\w+).*}/, '$1$2');
}

export function assertNever(value: never): asserts value is never {
	console.error('Assertion failed: did not expect', value);
	throw new Error;
}

export function compareClasses(classListA: DOMTokenList, classListB: DOMTokenList) {
	if (classListA.length !== classListB.length) return false;
	for (const item of classListA) {
		if (!classListB.contains(item)) return false;
	}
	return true;
}

export const isElement = (el: Node): el is Element => el.nodeType === Node.ELEMENT_NODE;
export const isTextNode = (el: Node): el is Text => el.nodeType === Node.TEXT_NODE;
export const isComment = (el: Node): el is Comment => el.nodeType === Node.COMMENT_NODE;

export type MapType<M, T extends (keyof M)[]> = { [K in keyof T]: M[T[K]]; };
export type MaybeUnwrap<T> = T extends [infer R] ? R : T;

export function maybeUnwrap<T>(arg: T): MaybeUnwrap<T> {
	return Array.isArray(arg) && arg.length === 1 ? arg[0] : arg as MaybeUnwrap<T>;
}

export function update<T extends Partial<U>, U extends Partial<T>>(obj: U, addons: T): U & T {
	for (const k in addons) {
		if (typeof obj[k] === 'object' && typeof addons[k] === 'object' && obj[k] !== null && addons[k] !== null) obj[k] = update(obj[k], addons[k]);
		else obj[k] = (addons as U & T)[k];
	}
	return obj as U & T;
}
