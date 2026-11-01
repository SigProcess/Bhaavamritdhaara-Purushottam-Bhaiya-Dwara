import type { CatalogStore, StoredCatalogVersion } from './catalogRepository'

const DATABASE_NAME = 'bhaavamrit-catalog-store'
const DATABASE_VERSION = 1
const COMPLETED = 'completed'
const STAGING = 'staging'
const METADATA = 'metadata'
const ACTIVE_KEY = 'active-sequence'

interface StoredVersionRecord extends StoredCatalogVersion {
  readonly id: number
}

const requestResult = <Value>(request: IDBRequest<Value>): Promise<Value> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
  })

const openDatabase = (indexedDB: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(COMPLETED)) database.createObjectStore(COMPLETED, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(STAGING)) database.createObjectStore(STAGING, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(METADATA)) database.createObjectStore(METADATA)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Catalog database could not be opened.'))
  })

const recordOf = (version: StoredCatalogVersion): StoredVersionRecord => ({
  ...version,
  id: version.sequence,
})

const versionOf = ({ id: _id, ...version }: StoredVersionRecord): StoredCatalogVersion => version

const createMemoryCatalogStore = (): CatalogStore => {
  const completed = new Map<number, StoredCatalogVersion>()
  const staged = new Map<number, StoredCatalogVersion>()
  let activeSequence: number | undefined

  return {
    async readCompleted() {
      return [...completed.values()].sort((left, right) => {
        if (left.sequence === activeSequence) return -1
        if (right.sequence === activeSequence) return 1
        return right.sequence - left.sequence
      })
    },
    async stage(version) {
      staged.set(version.sequence, version)
    },
    async commit(sequence) {
      const version = staged.get(sequence)
      if (!version) throw new Error('The staged catalog version does not exist.')
      completed.set(sequence, version)
      staged.delete(sequence)
      activeSequence = sequence
    },
    async discard(sequence) {
      staged.delete(sequence)
    },
    async prune(removableSequences) {
      for (const sequence of removableSequences) {
        if (sequence !== activeSequence) completed.delete(sequence)
      }
    },
  }
}

/** IndexedDB store with a single-transaction active-pointer switch. */
export function createBrowserCatalogStore(
  indexedDB: IDBFactory | undefined = globalThis.indexedDB,
): CatalogStore {
  if (!indexedDB) return createMemoryCatalogStore()
  let databasePromise: Promise<IDBDatabase> | undefined
  const database = () => databasePromise ??= openDatabase(indexedDB)

  return {
    async readCompleted(): Promise<readonly StoredCatalogVersion[]> {
      const db = await database()
      const transaction = db.transaction([COMPLETED, METADATA], 'readonly')
      const completedStore = transaction.objectStore(COMPLETED)
      const metadataStore = transaction.objectStore(METADATA)
      const [records, activeSequence] = await Promise.all([
        requestResult(completedStore.getAll() as IDBRequest<StoredVersionRecord[]>),
        requestResult(metadataStore.get(ACTIVE_KEY) as IDBRequest<number | undefined>),
      ])
      await transactionComplete(transaction)
      return records
        .map(versionOf)
        .sort((left, right) => {
          if (left.sequence === activeSequence) return -1
          if (right.sequence === activeSequence) return 1
          return right.sequence - left.sequence
        })
    },

    async stage(version: StoredCatalogVersion): Promise<void> {
      const db = await database()
      const transaction = db.transaction(STAGING, 'readwrite')
      transaction.objectStore(STAGING).put(recordOf(version))
      await transactionComplete(transaction)
    },

    async commit(sequence: number): Promise<void> {
      const db = await database()
      const transaction = db.transaction([STAGING, COMPLETED, METADATA], 'readwrite')
      const staging = transaction.objectStore(STAGING)
      const staged = await requestResult(staging.get(sequence) as IDBRequest<StoredVersionRecord | undefined>)
      if (!staged) {
        transaction.abort()
        throw new Error('The staged catalog version does not exist.')
      }
      transaction.objectStore(COMPLETED).put(staged)
      transaction.objectStore(METADATA).put(sequence, ACTIVE_KEY)
      staging.delete(sequence)
      await transactionComplete(transaction)
    },

    async discard(sequence: number): Promise<void> {
      const db = await database()
      const transaction = db.transaction(STAGING, 'readwrite')
      transaction.objectStore(STAGING).delete(sequence)
      await transactionComplete(transaction)
    },

    async prune(removableSequences: readonly number[]): Promise<void> {
      if (removableSequences.length === 0) return
      const db = await database()
      const transaction = db.transaction([COMPLETED, METADATA], 'readwrite')
      const metadata = transaction.objectStore(METADATA)
      const activeSequence = await requestResult(metadata.get(ACTIVE_KEY) as IDBRequest<number | undefined>)
      const completed = transaction.objectStore(COMPLETED)
      for (const sequence of removableSequences) {
        if (sequence !== activeSequence) completed.delete(sequence)
      }
      await transactionComplete(transaction)
    },
  }
}
