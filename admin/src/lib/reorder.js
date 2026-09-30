export function moveItem(list, index, delta) {
  const j = index + delta;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

// Only the items whose stored `key` differs from their new position (0..n-1).
export const renumber = (list, key = "sort") => list.map((item, i) => ({ item, sort: i })).filter(({ item, sort }) => item[key] !== sort);

export const reorderRequests = (list, key = "sort") => renumber(list, key).map(({ item, sort }) => ({ id: item._id, body: { [key]: sort } }));

// Runs the requests one after another. On failure throws the original error with `done` (ids already applied) attached,
// so the caller can reload server truth.
export async function runSequential(requests, put) {
  const done = [];
  for (const r of requests) {
    try {
      await put(r);
      done.push(r.id);
    } catch (e) {
      e.done = done;
      throw e;
    }
  }
  return done;
}
