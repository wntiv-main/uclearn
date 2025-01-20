type Override<T, U> = Omit<T, keyof U> & U;

type DatabaseVersionHandler<T> = (db: Override<IDBDatabase, {
	createObjectStore(): IDBObjectStore,
	createObjectStore<S extends keyof T>(name: S, options?: Override<IDBObjectStoreParameters, { keyPath: keyof T[S] }>): IDBObjectStore
}>) => void;

type ObjectStoreTypeOverrides<T> = {
	put(value: T, key?: IDBValidKey): IDBRequest<IDBValidKey>,
	add(value: T, key?: IDBValidKey): IDBRequest<IDBValidKey>,
	get(query: IDBValidKey | IDBKeyRange): IDBRequest<T | undefined>,
};
export type TypedObjectStore<T> = Override<IDBObjectStore, ObjectStoreTypeOverrides<T>>;
type TransactionTypeOverrides<T> = {
	objectStore<S extends keyof T>(name: S): TypedObjectStore<T[S]>
};
export type TypedTransaction<T> = Override<IDBTransaction, TransactionTypeOverrides<T>>;

export class DatabaseHandler<T> {
	#db?: IDBDatabase;
	#versionHandlers: DatabaseVersionHandler<T>[];
	DB_NAME: string;
	DB_VERSION: number;

	constructor(name: string, versionHandlers: DatabaseVersionHandler<T>[]) {
		this.DB_NAME = name;
		this.DB_VERSION = versionHandlers.length;
		this.#versionHandlers = versionHandlers;
	}

	async initDB() {
		if(this.#db) return this.#db;
		const dbReq = indexedDB.open(this.DB_NAME, this.DB_VERSION);
		dbReq.addEventListener("upgradeneeded", e => {
			const db = dbReq.result;
			for(let i = e.oldVersion; i < this.DB_VERSION; i++) {
				this.#versionHandlers[i](db as Parameters<DatabaseVersionHandler<T>>[0]);
			}
		});
		this.#db = await DatabaseHandler.prepare(dbReq);
		this.#db.addEventListener("versionchange", () => this.#db?.close?.());
		this.#db.addEventListener("close", () => {this.#db = undefined;});
		return this.#db;
	}

	async transaction(storeNames: keyof T & string | (keyof T & string)[], mode: IDBTransactionMode = 'readonly', options?: IDBTransactionOptions) {
		const db = await this.initDB();
		return db.transaction(storeNames, mode, options) as TypedTransaction<T>;
	}

	async openStore<S extends string & keyof T>(store: S, accessMode: IDBTransactionMode = 'readonly') {
		const transaction = await this.transaction(store, accessMode);
		return transaction.objectStore(store) as TypedObjectStore<T[S]>;
	}

	async *iterStore<S extends string & keyof T>(
		store: S,
		accessMode: IDBTransactionMode = 'readonly',
		...cursorOptions: Parameters<typeof IDBObjectStore.prototype.openCursor>
	) {
		const storeHandle = await this.openStore(store, accessMode);
		for await(const item of DatabaseHandler.iterCursor(storeHandle.openCursor(...cursorOptions))) {
			yield item as T[S];
		}
	}

	static async prepare<T>(request: IDBRequest<T>) {
		return await new Promise<T>((res, rej) => {
			request.addEventListener("error", () => rej(request.error));
			request.addEventListener("success", () => res(request.result));
		});
	}

	static async *iterCursor(cursor: IDBRequest<IDBCursorWithValue | null>) {
		while(true) {
			await new Promise((res, rej) => {
				cursor.onsuccess = res;
				cursor.onerror = () => rej(cursor.error);
			});
			const result = cursor.result;
			if(!result) return;
			yield result.value;
			result.continue();
		}
	}
}

export interface DBView<T> {
	serialize(): T;
}

export type DBStructure<T> = T extends DatabaseHandler<infer U> ? U : never;
export type DBStore<DB, S extends keyof DBStructure<DB>> = DBStructure<DB>[S];

export const uclearnDB = new DatabaseHandler<{
	courseIndex: {
		courseId: string,
		html: string,
		js: string,
	}
}>('uclearn', [
	db => {
		db.createObjectStore('courseIndex', {
			keyPath: 'courseId',
		});
	}
]);
