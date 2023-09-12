import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/:videoId?',
      name: 'list',
      component: async () => await import('@/components/genet/StreamingList.vue'),
      props: true,
    },
  ],
});

export default router;
