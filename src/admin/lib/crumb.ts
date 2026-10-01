import { onUnmounted, ref, watch } from 'vue';

/**
 * The open item's name, which the topbar's breadcrumb shows after the page's
 * own (`データ / あしあと / ウサコ4周年記念3D配信`). One value for the whole
 * shell, as with the toast: only one screen is visible at a time.
 */
export const crumbDetail = ref<string | null>(null);

/** Whoever set `crumbDetail` last - see `useCrumbDetail`'s unmount. */
let owner: symbol | null = null;

/**
 * Keeps the breadcrumb on whatever `source` names, and clears it when the
 * component goes.
 *
 * An editor re-keyed onto another item mounts its new instance before the
 * old one's unmount hook runs, so the old one clears the name only if it is
 * still the one that set it.
 */
export function useCrumbDetail(source: () => string | null | undefined): void {
  const self = Symbol('crumb');

  watch(
    source,
    (name) => {
      owner = self;
      crumbDetail.value = name === undefined || name === null || name === '' ? null : name;
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (owner !== self) return;

    owner = null;
    crumbDetail.value = null;
  });
}
