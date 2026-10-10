/** Coalesce mounted Explorer consumers, not authority or durable workflow state. */
export function createDirectoryLoader<T>() {
  const pending = new Map<string, { users: number; promise: Promise<T | null> }>();
  return (key: string, read: () => Promise<T | null>, request: (active: () => boolean) => Promise<T | null>) => {
    let entry = pending.get(key);
    if (!entry) {
      entry = { users: 0, promise: Promise.resolve(null) };
      const current = entry;
      entry.promise = Promise.resolve().then(read).then(saved => saved ?? (current.users ? request(() => current.users > 0) : null))
        .finally(() => { if (pending.get(key) === current) pending.delete(key); });
      pending.set(key, entry);
    }
    entry.users++;
    let released = false;
    return { promise: entry.promise, cancel: () => { if (!released) { released = true; entry!.users--; } } };
  };
}

export const MAX_AUTOMATIC_DIRECTORY_DISCOVERY = 64;
export const MAX_CONCURRENT_DIRECTORY_LISTINGS = 4;

/** A previous refresh observation must never seed discovery for a new tree. */
export function isCurrentDirectoryObservation(scope: string, loadedScope: string | null, initialId?: string, observedId?: string) {
  return scope === loadedScope && !!initialId && initialId === observedId;
}

type DiscoveryJob<T> = {
  key: string;
  task: (active: () => boolean) => Promise<T | null>;
  subscribers: Array<{ resolve: (value: T | null) => void; reject: (error: unknown) => void; active: boolean }>;
  active: boolean;
  started: boolean;
};

/** Bounds automatic tree discovery and coalesces scheduled paths within one mounted tree. */
export function createDirectoryDiscovery(maxDirectories = MAX_AUTOMATIC_DIRECTORY_DISCOVERY, concurrency = MAX_CONCURRENT_DIRECTORY_LISTINGS) {
  const reserved = new Set<string>();
  const queuedByKey = new Map<string, DiscoveryJob<unknown>>();
  const queue: DiscoveryJob<unknown>[] = [];
  let running = 0;
  let disposed = false;

  const dispatch = () => {
    while (!disposed && running < concurrency && queue.length) {
      const job = queue.shift()!;
      if (!job.active) { queuedByKey.delete(job.key); continue; }
      job.started = true;
      running++;
      void Promise.resolve().then(() => job.active && !disposed ? job.task(() => job.active && !disposed) : null).then(
        value => { for (const subscriber of job.subscribers) if (subscriber.active) subscriber.resolve(job.active && !disposed ? value : null); },
        error => { for (const subscriber of job.subscribers) if (subscriber.active) subscriber.reject(error); },
      ).finally(() => {
        running--;
        if (queuedByKey.get(job.key) === job) queuedByKey.delete(job.key);
        dispatch();
      });
    }
  };

  return {
    reserve(path: string) {
      if (reserved.has(path)) return true;
      if (disposed || reserved.size >= maxDirectories) return false;
      reserved.add(path);
      return true;
    },
    schedule<T>(key: string, task: (active: () => boolean) => Promise<T | null>) {
      if (disposed) return { promise: Promise.resolve(null) as Promise<T | null>, cancel: () => {} };
      const pending = queuedByKey.get(key) as DiscoveryJob<T> | undefined;
      const existing = pending?.active ? pending : undefined;
      if (pending && !pending.active) queuedByKey.delete(key);
      let resolve!: (value: T | null) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T | null>((res, rej) => { resolve = res; reject = rej; });
      const subscriber = { resolve, reject, active: !disposed };
      const job = existing ?? { key, task, subscribers: [], active: !disposed, started: false };
      job.subscribers.push(subscriber);
      if (!existing) {
        queuedByKey.set(key, job as DiscoveryJob<unknown>);
        queue.push(job as DiscoveryJob<unknown>);
        dispatch();
      }
      return {
        promise,
        cancel: () => {
          if (!subscriber.active) return;
          subscriber.active = false;
          subscriber.resolve(null);
          if (job.subscribers.every(item => !item.active)) {
            job.active = false;
            if (queuedByKey.get(job.key) === job) queuedByKey.delete(job.key);
            if (!job.started) for (const item of job.subscribers) item.resolve(null);
          }
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of queue) { job.active = false; for (const subscriber of job.subscribers) if (subscriber.active) subscriber.resolve(null); }
      queue.length = 0;
      for (const job of queuedByKey.values()) {
        if (job.started) job.active = false;
        for (const subscriber of job.subscribers) if (subscriber.active) { subscriber.active = false; subscriber.resolve(null); }
      }
      queuedByKey.clear();
    },
  };
}
