// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function getRemappedName(accessor: () => any) {
	return accessor.toString().replace(/^\s*(?:\([^)]*\)|\w+)\s*=>\s*(\w+)$|^\s*(?:(?:function\s+\w+|function|\w+)\s*\([^)]*\)|\([^)]*\)\s*=>)\s*{.*return\s+(\w+).*}/, '$1$2');
}

export function assertNever(value: never): asserts value is never {
	console.error('Assertion failed: did not expect', value);
	throw new Error;
}

export type MapType<M, T extends (keyof M)[]> = { [K in keyof T]: M[T[K]]; };
export type MaybeUnwrap<T> = T extends [infer R] ? R : T;

export function maybeUnwrap<T>(arg: T): MaybeUnwrap<T> {
	return Array.isArray(arg) && arg.length === 1 ? arg[0] : arg as MaybeUnwrap<T>;
}

export function update<T extends object, U>(obj: T, addons: U): T & U {
	const _obj = obj as Partial<U>;
	for (const k in addons) {
		if (typeof _obj[k] === 'object' && typeof addons[k] === 'object' && _obj[k] !== null && addons[k] !== null)
			_obj[k] = update(_obj[k], addons[k]);
		else _obj[k] = (addons as U & T)[k];
	}
	return obj as U & T;
}

export type Shifted<T extends unknown[]> = T extends [unknown, ...infer U extends unknown[]] ? U : never;
export type ExtendIf<T, P, U> = T extends P ? T & U : T;

export type ItemOf<T extends unknown[] | Iterable<unknown>> =
	T extends (infer U)[] ? U
	: T extends Iterable<infer U> ? U
	: never;
type FlattenItems<T extends Iterable<unknown>[]> = { [key in keyof T]: ItemOf<T[key]> };

export function* zip<T extends Iterable<unknown>[]>(...arrays: T) {
	const iterators = arrays.map(arr => arr[Symbol.iterator]());
	while (true) {
		const results = iterators.map(iter => iter.next());
		if (results.find(res => res.done)) return;
		yield results.map(res => res.value) as FlattenItems<T>;
	}
}

export function* map<T extends Iterable<unknown> | unknown[], R>(arr: T, mapper: (item: ItemOf<T>) => R) {
	for (const item of arr) {
		yield mapper(item as ItemOf<T>);
	}
}

export function asyncTimeout(delay: number) {
	return new Promise<void>(resolve => setTimeout(resolve, delay));
}
