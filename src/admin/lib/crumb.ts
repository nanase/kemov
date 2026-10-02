import { onUnmounted, ref, watch } from 'vue';

/**
 * The open item's name, which the topbar's breadcrumb shows after the page's
 * own (`データ / あしあと / ウサコ4周年記念3D配信`). One value for the whole
 * shell, as with the toast: only one screen is visible at a time.
 */
export const crumbDetail = ref<string | null>(null);

/** Whoever set `crumbDetail` last. */
let owner: symbol | null = null;

/** `holder` names the open item; an empty name is the same as none. */
export function claimCrumb(holder: symbol, name: string | null | undefined): void {
  owner = holder;
  crumbDetail.value = name === undefined || name === null || name === '' ? null : name;
}

/**
 * `holder` is going. The name is cleared only if `holder` is still the one
 * that set it: an editor re-keyed onto another item mounts its new instance
 * before the old one's unmount hook runs, and the new name has to stay.
 */
export function releaseCrumb(holder: symbol): void {
  if (owner !== holder) return;

  owner = null;
  crumbDetail.value = null;
}

/** Keeps the breadcrumb on whatever `source` names, and clears it when the component goes. */
export function useCrumbDetail(source: () => string | null | undefined): void {
  const holder = Symbol('crumb');

  watch(source, (name) => claimCrumb(holder, name), { immediate: true });
  onUnmounted(() => releaseCrumb(holder));
}
