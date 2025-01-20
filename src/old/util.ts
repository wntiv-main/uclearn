// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function getRemappedName(accessor: () => any) {
	return accessor.toString().replace(/^\s*(?:\([^)]*\)|\w+)\s*=>\s*(\w+)$|^\s*(?:(?:function\s+\w+|function|\w+)\s*\([^)]*\)|\([^)]*\)\s*=>)\s*{.*return\s+(\w+).*}/, '$1$2');
}

export function assertNever(value: never): asserts value is never {
	console.error('Assertion failed: did not expect', value);
	throw new Error;
}

export function compareClasses(classListA: DOMTokenList, classListB: DOMTokenList) {
	if(classListA.length !== classListB.length) return false;
	for(const item of classListA) {
		if(!classListB.contains(item)) return false;
	}
	return true;
}

export const isElement = (el: Node): el is Element => el.nodeType === Node.ELEMENT_NODE;
export const isTextNode = (el: Node): el is Text => el.nodeType === Node.TEXT_NODE;
export const isComment = (el: Node): el is Comment => el.nodeType === Node.COMMENT_NODE;
