import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, type Component } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

/**
 * Mounts one admin screen as the router shows it, for the `dom` project's
 * tests: under a `RouterView` of a memory router, so that a screen which
 * reads its route or guards leaving it works as it does in the shell. The
 * rest of the shell - the sidebar, the topbar - is left out.
 *
 * Settled once the router has: the screen's own requests on mount are still
 * the test's to answer.
 */
export async function mountPage(page: Component): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: page }],
  });

  await router.push('/');
  await router.isReady();

  return mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
    attachTo: document.body,
  });
}
