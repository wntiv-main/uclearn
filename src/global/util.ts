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

export function deferAccess<T extends object>(awaitable: PromiseLike<T>) {
	const internal = (() => { }) as unknown as {
		__promise: PromiseLike<T>;
		__value?: T;
	};
	internal.__promise = awaitable;
	awaitable.then(value => { internal.__value = value; });
	const wrapper: typeof internal = new Proxy(internal, {
		apply(target, thisArg, argArray) {
			if (typeof target.__value !== 'undefined')
				// biome-ignore lint/suspicious/noExplicitAny: pass error up if invalid
				return Reflect.apply(target.__value as any, thisArg, argArray);
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			return deferAccess(target.__promise.then((t) => Reflect.apply(t as any, thisArg, argArray)));
		},
		construct(target, argArray, newTarget) {
			if (typeof target.__value !== 'undefined')
				// biome-ignore lint/suspicious/noExplicitAny: pass error up if invalid
				return Reflect.construct(target.__value as any, argArray, newTarget);
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			return deferAccess(target.__promise.then((t) => Reflect.construct(t as any, argArray, newTarget)));
		},
		defineProperty(target, property, attributes) {
			if (typeof target.__value !== 'undefined')
				return Reflect.defineProperty(target.__value, property, attributes);
			target.__promise.then((t) => Reflect.defineProperty(t, property, attributes));
			return true; //spoof
		},
		deleteProperty(target, p) {
			if (typeof target.__value !== 'undefined')
				return Reflect.deleteProperty(target.__value, p);
			target.__promise.then((t) => Reflect.deleteProperty(t, p));
			return true; // spoof
		},
		get(target, p, receiver) {
			if (typeof target.__value !== 'undefined')
				return Reflect.get(target.__value, p);
			return deferAccess(target.__promise.then((t) => Reflect.get(t, p)));
		},
		getOwnPropertyDescriptor(target, p) {
			if (typeof target.__value !== 'undefined')
				return Reflect.getOwnPropertyDescriptor(target.__value, p);
			// biome-ignore lint/style/noNonNullAssertion: pretend its fine for now
			return deferAccess(target.__promise.then((t) => Reflect.getOwnPropertyDescriptor(t, p)!));
		},
		getPrototypeOf(target) {
			if (typeof target.__value !== 'undefined')
				return Reflect.getPrototypeOf(target.__value);
			// biome-ignore lint/style/noNonNullAssertion: ittl be okay
			return deferAccess(target.__promise.then((t) => Reflect.getPrototypeOf(t)!));
		},
		has(target, p) {
			if (typeof target.__value !== 'undefined')
				return Reflect.has(target.__value, p);
			return false; // uh oh
		},
		isExtensible(target) {
			if (typeof target.__value !== 'undefined')
				return Reflect.isExtensible(target.__value);
			return true; // uh oh
		},
		ownKeys(target) {
			if (typeof target.__value !== 'undefined')
				return Reflect.ownKeys(target.__value);
			return []; // uh oh
		},
		preventExtensions(target) {
			if (typeof target.__value !== 'undefined')
				return Reflect.preventExtensions(target.__value);
			target.__promise.then((t) => Reflect.preventExtensions(t));
			return true; // spoof
		},
		set(target, p, newValue, receiver) {
			if (typeof target.__value !== 'undefined')
				return Reflect.set(target.__value, p, newValue);
			target.__promise.then((t) => Reflect.set(t, p, newValue));
			return true; // spoof
		},
		setPrototypeOf(target, v) {
			if (typeof target.__value !== 'undefined')
				return Reflect.setPrototypeOf(target.__value, v);
			target.__promise.then((t) => Reflect.setPrototypeOf(t, v));
			return true; // spoof
		},
	});
	return wrapper as T;
};
