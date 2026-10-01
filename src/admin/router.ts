import { createRouter, createWebHistory } from 'vue-router';

/**
 * The sidebar's destinations are paths (`/admin/footprints`), not `#`
 * fragments (#144's handoff) - the worker answers the same HTML for every
 * `/admin/*` path (see `worker/src/admin/index.ts`), so a reload or a shared
 * link lands back on the same screen instead of the shell's default.
 *
 * Every sidebar destination has a screen of its own. `PlaceholderPage.vue`
 * answers a path no sidebar item names.
 */
const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    { path: '/', redirect: '/footprints' },
    { path: '/footprints', component: () => import('./pages/FootprintsPage.vue') },
    { path: '/publish', component: () => import('./pages/PublishPage.vue') },
    { path: '/channels', component: () => import('./pages/MembersPage.vue') },
    { path: '/videos', component: () => import('./pages/VideosPage.vue') },
    { path: '/snaps', component: () => import('./pages/SnapsPage.vue') },
    { path: '/subscribers', component: () => import('./pages/SubscribersPage.vue') },
    { path: '/inbox-review', component: () => import('./pages/InboxReviewPage.vue') },
    { path: '/inbox-source', component: () => import('./pages/InboxSourcePage.vue') },
    { path: '/inbox-collect', component: () => import('./pages/CollectPage.vue') },
    { path: '/inbox-publish', component: () => import('./pages/InboxPublishPage.vue') },
    { path: '/history', component: () => import('./pages/HistoryPage.vue') },
    { path: '/sets', component: () => import('./pages/SetsPage.vue') },
    { path: '/source-whitelist', component: () => import('./pages/SourceWhitelistPage.vue') },
    {
      path: '/:page',
      component: () => import('./pages/PlaceholderPage.vue'),
      props: (route) => ({ page: String(route.params.page) }),
    },
  ],
});

export default router;
