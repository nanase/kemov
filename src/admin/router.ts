import { createRouter, createWebHistory } from 'vue-router';

/**
 * The sidebar's destinations are paths (`/admin/footprints`), not `#`
 * fragments (#144's handoff) - the worker answers the same HTML for every
 * `/admin/*` path (see `worker/src/admin/index.ts`), so a reload or a shared
 * link lands back on the same screen instead of the shell's default.
 *
 * `FootprintsPage`, `PublishPage`, `MembersPage` and `VideosPage` are this
 * project's own screens so far. Every other sidebar destination still
 * routes to `PlaceholderPage.vue` until a later task builds a real screen
 * for it.
 */
const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/', redirect: '/footprints' },
    { path: '/footprints', component: () => import('./pages/FootprintsPage.vue') },
    { path: '/publish', component: () => import('./pages/PublishPage.vue') },
    { path: '/channels', component: () => import('./pages/MembersPage.vue') },
    { path: '/videos', component: () => import('./pages/VideosPage.vue') },
    {
      path: '/:page',
      component: () => import('./pages/PlaceholderPage.vue'),
      props: (route) => ({ page: String(route.params.page) }),
    },
  ],
});

export default router;
