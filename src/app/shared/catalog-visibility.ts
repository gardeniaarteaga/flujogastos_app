export interface UserScopedCatalogItem {
  id_usuario?: number | null;
  es_predeterminada?: boolean | null;
}

export interface UserOwnedCatalogItem {
  id_usuario?: number | null;
}

export function isVisibleForCurrentUser<T extends UserScopedCatalogItem>(
  item: T,
  currentUserId: number,
): boolean {
  return Boolean(item.es_predeterminada) || Number(item.id_usuario ?? 0) === currentUserId;
}

export function filterVisibleForCurrentUser<T extends UserScopedCatalogItem>(
  items: T[],
  currentUserId: number,
): T[] {
  return items.filter((item) => isVisibleForCurrentUser(item, currentUserId));
}

export function filterOwnedByCurrentUser<T extends UserOwnedCatalogItem>(
  items: T[],
  currentUserId: number,
): T[] {
  return items.filter((item) => Number(item.id_usuario ?? 0) === currentUserId);
}
