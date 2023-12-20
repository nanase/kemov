import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/:channelId',
      name: 'detail',
      component: async () => await import('@/stats/detail/DetailView.vue'),
      props: true,
    },
    {
      path: '/',
      component: { template: '' },
      beforeEnter: function () {
        window.location.href = '../';
      },
    },
  ],
});

export default router;
