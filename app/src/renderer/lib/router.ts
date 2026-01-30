import type { Component } from 'svelte';
import { get, writable } from 'svelte/store';

// @ts-ignore
import HomePage from '$lib/pages/home.svelte';
// @ts-ignore
import AudioSourcesPage from '$lib/pages/audio-sources.svelte';
// @ts-ignore
import ValueBindingsPage from '$lib/pages/value-bindings.svelte';
// @ts-ignore
import ValueMonitorPage from '$lib/pages/value-monitor.svelte';
// @ts-ignore
import ShaderEditorPage from '$lib/pages/shader-editor.svelte';
// @ts-ignore
import NodeEditorPage from '$lib/pages/node-editor.svelte';

export type RouterState = {
  routes: Record<string, Component>;
  currentPage: {
    path: string;
    component?: Component;
    query: Record<string, string>;
  };
};

const initial: RouterState = {
  routes: {
    '/': HomePage,
    '/audio-sources': AudioSourcesPage,
    '/value-bindings': ValueBindingsPage,
    '/value-monitor': ValueMonitorPage,
    '/shader-editor': ShaderEditorPage,
    '/node-editor': NodeEditorPage,
  },
  currentPage: {
    path: '/',
    component: HomePage,
    query: {},
  },
};

export const router = writable<RouterState>(initial);

let lastPath = '';
function onHashChange() {
  const hash = window.location.hash.slice(1);
  const [pathPart, queryString = ''] = hash.split('?');

  router.update((state) => {
    const next: RouterState = {
      ...state,
      currentPage: { ...state.currentPage },
    };

    if (pathPart && pathPart !== lastPath) {
      const component = state.routes[pathPart];
      if (component) {
        next.currentPage.path = pathPart;
        next.currentPage.component = component;
        lastPath = pathPart;
      }
    }

    const query: Record<string, string> = {};
    if (queryString) {
      for (const pair of queryString.split('&')) {
        if (!pair) continue;
        const [key, value] = pair.split('=');
        if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
    next.currentPage.query = query;
    return next;
  });
}

window.location.hash = window.location.hash.replace(/^#/, "") || get(router).currentPage.path;
window.addEventListener('hashchange', onHashChange);
onHashChange();

export function navigate(path: string, query: Record<string, string> = {}) {
  const queryString = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const fullPath = queryString ? `${path}?${queryString}` : path;
  window.location.hash = fullPath;
}

export function changeQuery(newQuery: Record<string, string>) {
  let currentPath = '/';
  router.update((state) => {
    currentPath = state.currentPage.path;
    return state;
  });
  navigate(currentPath, newQuery);
}