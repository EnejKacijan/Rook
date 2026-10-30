export const PREVIEW_PREFIX = 'rook-theme-preview-v2:';

export function scopedStorage(store, prefix = PREVIEW_PREFIX) {
  const keys = () => Array.from({ length: store.length }, (_, i) => store.key(i))
    .filter(key => key?.startsWith(prefix));
  return {
    get length() { return keys().length; },
    key: index => keys()[index]?.slice(prefix.length) ?? null,
    getItem: key => store.getItem(prefix + key),
    setItem: (key, value) => store.setItem(prefix + key, value),
    removeItem: key => store.removeItem(prefix + key),
    clear: () => keys().forEach(key => store.removeItem(key)),
  };
}

export function scopedDatabases(databases, prefix = PREVIEW_PREFIX) {
  return new Proxy(databases, {
    get(target, property) {
      if (property === 'open') return (name, version) => version === undefined
        ? target.open(prefix + name) : target.open(prefix + name, version);
      if (property === 'deleteDatabase') return name => target.deleteDatabase(prefix + name);
      if (property === 'databases' && target.databases) return async () =>
        (await target.databases()).filter(db => db.name?.startsWith(prefix))
          .map(db => ({ ...db, name: db.name.slice(prefix.length) }));
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
