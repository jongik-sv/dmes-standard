export function cloneSnapshot<T>(snapshot: T): T {
  if (snapshot === null || snapshot === undefined) {
    return snapshot;
  }

  return JSON.parse(JSON.stringify(snapshot)) as T;
}

export function isSnapshotEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
