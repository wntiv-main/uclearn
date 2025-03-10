import type { Override } from "../global/util";

type Slice1<T extends unknown[]> = T extends [unknown, ...infer R extends unknown[]] ? R : never;

type Messenger<Send, Recv> = {
	send: { postMessage(message: Send, ...args: Slice1<Parameters<typeof postMessage>>): void; };
	recv: {
		addEventListener(type: "message", callback: (e: Override<MessageEvent, {
			data: Recv,
		}>) => unknown): void;
	};
};

const SYMBOL_TSYM = '__symbol';
const ID_TSYM = '__id';
const REMOTE_ID_TSYM = '__remote_id';

type _Symbol<Name extends string = string> = { [SYMBOL_TSYM]: Name; };
type _Object = { [ID_TSYM]: number; };
type _RemoteObject = { [REMOTE_ID_TSYM]: number; _avoidAsync?: boolean; };
type TransportObject = _Object | _RemoteObject | _Symbol | string | number | bigint | null | undefined | Record<string | number, unknown>;

type Message =
	| [task: 'apply', target: number, thisArg: TransportObject, returnId: number, ...args: TransportObject[]]
	| [task: 'construct', target: number, returnId: number, ...args: TransportObject[]]
	| [task: 'defineProperty', target: number, property: string | _Symbol, attributes: TransportObject]
	| [task: 'deleteProperty', target: number, property: string | _Symbol]
	| [task: 'get', target: number, property: string | _Symbol, returnId: number]
	| [task: 'getOwnPropertyDescriptor', target: number, property: string | _Symbol, returnId: number]
	| [task: 'getPrototypeOf', target: number, returnId: number]
	| [task: 'ownKeys', target: number, returnId: number]
	| [task: 'preventExtensions', target: number]
	| [task: 'set', target: number, property: string | _Symbol, value: TransportObject]
	| [task: 'setPrototypeOf', target: number, value: TransportObject];

const ID_SYMBOL = Symbol('JSProxyId');
export class JSProxy<U extends object> {
	readonly #channel: Messenger<Message, Message>;
	readonly interface: U;
	readonly #localHandles: Record<string | symbol, unknown & object> = {};
	readonly #targetOrigin: string | undefined = undefined;
	#localId = 0;
	#remoteId = 0;

	#isSerializable(obj: unknown, depth = 3): obj is TransportObject {
		if (typeof obj === 'function') return false;
		if (typeof obj === 'object' && obj != null) {
			if (depth < 0) return false;
			if (obj.constructor !== Object && obj.constructor !== Array) return false;
			for (const [key, value] of Object.entries(obj)) {
				if (typeof key === 'symbol') return false;
				if (typeof value === 'function') return false;
				if (typeof value === 'symbol') return false;
				if (typeof value === 'object' && !this.#isSerializable(value, depth - 1)) return false;
			}
		}
		return true;
	}

	#wrap(obj: unknown, _avoidAsync?: boolean): TransportObject {
		if ((typeof obj === 'object' || typeof obj === 'function')
			&& obj != null
			&& ID_SYMBOL in obj) return { [ID_TSYM]: obj[ID_SYMBOL] as number } satisfies _Object;
		if (typeof obj === 'symbol' && obj.description) return { [SYMBOL_TSYM]: obj.description } satisfies _Symbol;
		if (this.#isSerializable(obj)) return obj;
		const id = --this.#remoteId;
		this.#localHandles[id] = obj;
		return { [REMOTE_ID_TSYM]: id, _avoidAsync } satisfies _RemoteObject;
	}

	#unwrap(obj: TransportObject): unknown {
		if (typeof obj === 'object' && obj != null && ID_TSYM in obj)
			return this.#localHandles[obj[ID_TSYM] as number];
		if (typeof obj === 'object' && obj != null && SYMBOL_TSYM in obj) {
			const match = (obj[SYMBOL_TSYM] as string).match(/Symbol\.(.*)/);
			return match ? Symbol[match[1] as keyof typeof Symbol] : undefined;
		}
		if (typeof obj === 'object' && obj != null && REMOTE_ID_TSYM in obj) {
			const [, value] = this.#createWrapper(obj[REMOTE_ID_TSYM] as number, obj._avoidAsync as boolean | undefined);
			return value;
		}
		return obj;
	}

	#createWrapper<T extends object>(_id?: number, _innerAsync = false): readonly [number, T] {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const handler = this;
		const id = _id ?? this.#localId++;
		return [id, new Proxy<T>(Object as T, {
			apply(_, thisArg, argArray) {
				const [returnId, result] = handler.#createWrapper<T extends (() => infer R extends object) ? R : never>();
				handler.#channel.send.postMessage([
					'apply',
					id,
					handler.#wrap(thisArg as TransportObject),
					returnId,
					...argArray.map(arg => handler.#wrap(arg)),
				], { targetOrigin: handler.#targetOrigin });
				return result;
			},
			construct(_, argArray) {
				const [returnId, result] = handler.#createWrapper<T extends { new(): infer R extends object; } ? R : never>();
				handler.#channel.send.postMessage([
					'construct',
					id,
					returnId,
					...argArray.map(arg => handler.#wrap(arg)),
				], { targetOrigin: handler.#targetOrigin });
				return result;
			},
			defineProperty(_, property, attributes) {
				handler.#channel.send.postMessage([
					'defineProperty',
					id,
					handler.#wrap(property) as string | _Symbol,
					handler.#wrap(attributes),
				], { targetOrigin: handler.#targetOrigin });
				return true; // hopeful
			},
			deleteProperty(_, p) {
				handler.#channel.send.postMessage([
					'deleteProperty',
					id,
					handler.#wrap(p) as string | _Symbol,
				], { targetOrigin: handler.#targetOrigin });
				return true; // hopeful
			},
			get<P extends (string | symbol) & keyof T>(_: T, p: P) {
				if (p === ID_SYMBOL) return id;
				if (p === 'then' && _innerAsync) return undefined;
				const [returnId, result] = handler.#createWrapper<T[P] extends object ? T[P] : never>(undefined, p === 'then');
				handler.#channel.send.postMessage([
					'get',
					id,
					handler.#wrap(p) as string | _Symbol,
					returnId,
				], { targetOrigin: handler.#targetOrigin });
				return result;
			},
			getOwnPropertyDescriptor(_, p) {
				const [returnId, result] = handler.#createWrapper<PropertyDescriptor | object>();
				handler.#channel.send.postMessage([
					'getOwnPropertyDescriptor',
					id,
					handler.#wrap(p) as string | _Symbol,
					returnId,
				], { targetOrigin: handler.#targetOrigin });
				return result;
			},
			getPrototypeOf() {
				const [returnId, result] = handler.#createWrapper<object>();
				handler.#channel.send.postMessage([
					'getPrototypeOf',
					id,
					returnId,
				], { targetOrigin: handler.#targetOrigin });
				return result;
			},
			has(_, p) {
				if (p === ID_SYMBOL) return true;
				return false; // uh oh
			},
			isExtensible() {
				return false; // uh oh
			},
			ownKeys() {
				const [returnId, result] = handler.#createWrapper<ArrayLike<string | symbol>>();
				handler.#channel.send.postMessage([
					'ownKeys',
					id,
					returnId,
				], { targetOrigin: handler.#targetOrigin });
				return result;
			},
			preventExtensions() {
				handler.#channel.send.postMessage([
					'preventExtensions',
					id,
				], { targetOrigin: handler.#targetOrigin });
				return true; // hopeful
			},
			set(_, p, newValue) {
				handler.#channel.send.postMessage([
					'set',
					id,
					handler.#wrap(p) as string | _Symbol,
					handler.#wrap(newValue),
				], { targetOrigin: handler.#targetOrigin });
				return true; // hopeful
			},
			setPrototypeOf(_, v) {
				handler.#channel.send.postMessage([
					'setPrototypeOf',
					id,
					handler.#wrap(v),
				], { targetOrigin: handler.#targetOrigin });
				return true; // hopeful
			},
		})] as const;
	}

	constructor (sender: MessageEventSource, receiver: MessageEventSource, root: unknown & object = {}, targetOrigin?: string) {
		this.#localHandles[0] = root;
		this.#channel = { send: sender, recv: receiver };
		try { this.#targetOrigin = targetOrigin ?? (sender as Window).location?.origin; } catch { /* pass */ }
		[, this.interface] = this.#createWrapper<U>();
		this.#channel.recv.addEventListener("message", e => {
			this.#handleMessage(e.data);
		});
	}

	#handleMessage(message: Message) {
		switch (message[0]) {
			case "apply": {
				const [, target, _this, returnId, ...fnArgs] = message;
				this.#localHandles[returnId] = (this.#localHandles[target] as (...args: unknown[]) => unknown).call(
					this.#unwrap(_this),
					...fnArgs.map(arg => this.#unwrap(arg))) as unknown & object;
				break;
			}
			case "construct": {
				const [, target, returnId, ...fnArgs] = message;
				this.#localHandles[returnId] = new (this.#localHandles[target] as { new(...args: unknown[]): unknown & object; })(
					...fnArgs.map(arg => this.#unwrap(arg)));
				break;
			}
			case "defineProperty": {
				const [, target, property, attributes] = message;
				Object.defineProperty(this.#localHandles[target], this.#unwrap(property) as string | symbol, this.#unwrap(attributes) as PropertyDescriptor);
				break;
			}
			case "deleteProperty": {
				const [, target, property] = message;
				const obj = this.#localHandles[target];
				delete obj[this.#unwrap(property) as keyof typeof obj];
				break;
			}
			case "get": {
				const [, target, property, returnId] = message;
				const obj = this.#localHandles[target];
				this.#localHandles[returnId] = property === 'then'
					? (obj as Partial<PromiseLike<unknown>> | undefined)?.then ?? ((res: (value: unknown) => void) => ID_SYMBOL in res ? res(this.#wrap(obj, true)) : res(obj))
					: obj[this.#unwrap(property) as keyof typeof obj];
				break;
			}
			case "getOwnPropertyDescriptor": {
				const [, target, property, returnId] = message;
				this.#localHandles[returnId] = Object.getOwnPropertyDescriptor(this.#localHandles[target], this.#unwrap(property) as string | symbol) ?? {};
				break;
			}
			case "getPrototypeOf": {
				const [, target, returnId] = message;
				this.#localHandles[returnId] = Object.getPrototypeOf(this.#localHandles[target]);
				break;
			}
			case "ownKeys": {
				const [, target, returnId] = message;
				this.#localHandles[returnId] = Reflect.ownKeys(this.#localHandles[target]);
				break;
			}
			case "preventExtensions": {
				const [, target] = message;
				Object.preventExtensions(this.#localHandles[target]);
				break;
			}
			case "set": {
				const [, target, property, value] = message;
				const obj = this.#localHandles[target] as Record<string | symbol, unknown>;
				obj[this.#unwrap(property) as string | symbol] = this.#unwrap(value);
				break;
			}
			case "setPrototypeOf": {
				const [, target, value] = message;
				Object.setPrototypeOf(this.#localHandles[target], this.#unwrap(value) as object);
				break;
			}
		}
	}
}
