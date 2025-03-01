type Override<T, U> = Omit<T, keyof U> & U;

declare const KEY_PATH: unique symbol;// = Symbol('KeyPath');

// type KEYPATH = unique symbol;
export type WithKeyPath<T extends ObjectStoreDescription, Key extends keyof T> = T & { [KEY_PATH]: Key; };

type ObjectStoreDescription = {
	[KEY_PATH]?: string;
	[key: string | number]: unknown;
};

type ObjectStoreValue<T extends ObjectStoreDescription> = Omit<T, typeof KEY_PATH>;

type DatabaseDescription = {
	[key: string]: ObjectStoreDescription;
};

type DatabaseVersionHandler<T extends DatabaseDescription> = (db: TypedDatabase<T>) => void;

export type TypedDatabase<T extends DatabaseDescription> = Override<IDBDatabase, {
	createObjectStore(): IDBObjectStore;
	createObjectStore<S extends keyof T>(
		name: S,
		options: T[S][typeof KEY_PATH] extends string | symbol | number
			? Override<IDBObjectStoreParameters, { keyPath: T[S][typeof KEY_PATH]; }>
			: Omit<IDBObjectStoreParameters, 'keyPath'>
	): TypedObjectStore<T[S], 'versionchange'>;
}>;

type ObjectStoreTypeOverrides<T extends ObjectStoreDescription> = {
	put(value: ObjectStoreValue<T>, key?: IDBValidKey): IDBRequest<IDBValidKey>,
	add(value: ObjectStoreValue<T>, key?: IDBValidKey): IDBRequest<IDBValidKey>,
	get(query: IDBKeyRange): IDBRequest<ObjectStoreValue<T>[] | undefined>,
} & (T[typeof KEY_PATH] extends string | symbol | number ? {
	get<K extends IDBValidKey & T[T[typeof KEY_PATH] & keyof T]>(query: K): IDBRequest<ObjectStoreValue<Extract<T, { [I in NonNullable<T[typeof KEY_PATH]>]: K }>> | undefined>,
} : {
	get(query: IDBValidKey): IDBRequest<ObjectStoreValue<T> | undefined>,
});

type _TypedObjectStore<T extends ObjectStoreDescription> = Pick<IDBObjectStore, 'openCursor'> & Override<IDBObjectStore, ObjectStoreTypeOverrides<T>>;
export type TypedObjectStore<T extends ObjectStoreDescription, M extends IDBTransactionMode> = M extends 'readonly' ? Omit<_TypedObjectStore<T>, 'add' | 'put'> : _TypedObjectStore<T>;
type TransactionTypeOverrides<T extends DatabaseDescription, M extends IDBTransactionMode> = {
	objectStore<S extends keyof T>(name: S): TypedObjectStore<T[S], M>;
};
export type TypedTransaction<T extends DatabaseDescription, M extends IDBTransactionMode> = Override<IDBTransaction, TransactionTypeOverrides<T, M>>;

export class DatabaseHandler<T extends DatabaseDescription> {
	#db?: TypedDatabase<T>;
	#versionHandlers: DatabaseVersionHandler<T>[];
	DB_NAME: string;
	DB_VERSION: number;

	constructor (name: string, versionHandlers: DatabaseVersionHandler<T>[]) {
		this.DB_NAME = name;
		this.DB_VERSION = versionHandlers.length;
		this.#versionHandlers = versionHandlers;
	}

	async initDB() {
		if (this.#db) return this.#db;
		const dbReq = indexedDB.open(this.DB_NAME, this.DB_VERSION);
		dbReq.addEventListener("upgradeneeded", e => {
			const db = dbReq.result;
			for (let i = e.oldVersion; i < this.DB_VERSION; i++) {
				this.#versionHandlers[i](db as Parameters<DatabaseVersionHandler<T>>[0]);
			}
		});
		this.#db = await DatabaseHandler.prepare(dbReq) as TypedDatabase<T>;
		this.#db.addEventListener("versionchange", () => this.#db?.close?.());
		this.#db.addEventListener("close", () => { this.#db = undefined; });
		return this.#db;
	}

	async transaction<M extends IDBTransactionMode>(storeNames: keyof T & string | (keyof T & string)[], mode: M, options?: IDBTransactionOptions) {
		const db = await this.initDB();
		return db.transaction(storeNames, mode, options) as TypedTransaction<T, M>;
	}

	async openStore<S extends string & keyof T, M extends IDBTransactionMode>(store: S, accessMode: M) {
		const transaction = await this.transaction(store, accessMode);
		return transaction.objectStore(store) as TypedObjectStore<T[S], M>;
	}

	async *iterStore<S extends string & keyof T>(
		store: S,
		accessMode: IDBTransactionMode = 'readonly',
		...cursorOptions: Parameters<typeof IDBObjectStore.prototype.openCursor>
	) {
		const storeHandle = await this.openStore(store, accessMode);
		for await (const item of DatabaseHandler.iterCursor(storeHandle.openCursor(...cursorOptions))) {
			yield item as ObjectStoreValue<T[S]>;
		}
	}

	static async prepare<T>(request: IDBRequest<T>) {
		return await new Promise<T>((res, rej) => {
			request.addEventListener("error", () => rej(request.error));
			request.addEventListener("success", () => res(request.result));
		});
	}

	static async *iterCursor(cursor: IDBRequest<IDBCursorWithValue | null>) {
		while (true) {
			await new Promise((res, rej) => {
				cursor.onsuccess = res;
				cursor.onerror = () => rej(cursor.error);
			});
			const result = cursor.result;
			if (!result) return;
			yield result.value;
			result.continue();
		}
	}
}

export type DBStructure<T> = T extends DatabaseHandler<infer U> ? U : never;
export type DBStoreValue<DB, S extends keyof DBStructure<DB>> = Omit<DBStructure<DB>[S], typeof KEY_PATH>;
export type DBStoreKeyPath<DB, S extends keyof DBStructure<DB>> = DBStructure<DB>[S][typeof KEY_PATH];

type _KeyValue<T extends object, K extends keyof T> = K extends unknown ? { key: K, value: T[K]; } : never;
export type KeyValue<T extends object> = _KeyValue<T, keyof T>;
