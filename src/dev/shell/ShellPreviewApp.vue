<script setup lang="ts">
/**
 * A page for checking the shell on the dev server. It is not a build input,
 * so it never reaches dist/.
 *
 * The query picks what is shown:
 *   page   footprints | stats | members | videos | genet
 *   state  ok | loading | error
 *   items  8 adds three placeholder links, to see the band overflow
 *
 * The body is placeholder panels tall enough to scroll, each with a block of
 * the accent colour on its left to see through the navigation's frosted glass.
 */
import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt, { type UpdatedAtState } from '@/shell/UpdatedAt.vue';
import { SITE_PAGES, type NavItem, type PageId } from '@/shell/pages';

interface PreviewPage {
  title: string;
  notes: { text: string; link?: { before: string; label: string; href: string; after: string } }[];
  /** Rows of panels; each number is a panel's height in px. `flat` is a strip of chips. */
  rows: { layout?: string; panels: (number | 'flat')[] }[];
}

const NON_OFFICIAL = { text: 'このサイトは非公式のファンサイトです' };

const PAGES: Record<PageId, PreviewPage> = {
  footprints: {
    title: 'けもV あしあと',
    notes: [
      { text: '配信・動画の記録は 10 分ごとに更新しています' },
      { text: 'できごとは運営やメンバーの発表をもとに記録しています' },
      { text: '周年と日数は、できごとに記録したデビューの日から数えています' },
      { text: '日時はすべて日本時間です' },
      NON_OFFICIAL,
    ],
    rows: [{ panels: [96] }, { layout: 'footprints', panels: [1700, 520] }],
  },
  stats: {
    title: 'けもV 統計',
    notes: [
      { text: 'およそ 10 分ごとに自動で更新されます。数値は減少することがあります' },
      { text: '総再生数と配信・動画数は配信終了後から反映されます' },
      NON_OFFICIAL,
    ],
    rows: [{ panels: [58] }, { panels: ['flat'] }, { layout: 'stats', panels: [620, 1500] }],
  },
  members: {
    title: 'けもV メンバー',
    notes: [{ text: '数値の反映に数日かかることがあります' }, NON_OFFICIAL],
    rows: [
      { layout: 'members', panels: [724, 724] },
      { panels: [260] },
      { layout: 'members-3', panels: [240, 240, 240] },
    ],
  },
  videos: {
    title: 'けもV 配信・動画',
    notes: [{ text: '指標を計算できる動画のみ表示しています' }, NON_OFFICIAL],
    rows: [{ panels: [128] }, { layout: 'videos', panels: [990, 990] }, { panels: [360] }],
  },
  genet: {
    title: 'ジェネット楽曲一覧',
    notes: [
      {
        text: '',
        link: {
          before: '掲載内容についてのお問い合わせは ',
          label: 'issue',
          href: 'https://github.com/nanase/kemov/issues',
          after: ' までご連絡ください',
        },
      },
      NON_OFFICIAL,
    ],
    rows: [{ panels: [46] }, { layout: 'genet', panels: [1500, 760, 760] }],
  },
};

const query = new URLSearchParams(location.search);

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const pageId = pick(query.get('page'), Object.keys(PAGES) as PageId[], 'footprints');
const state = pick<UpdatedAtState>(query.get('state'), ['ok', 'loading', 'error'], 'ok');
const page = PAGES[pageId];
const isGenet = pageId === 'genet';

/** A fetch three minutes and twelve seconds before the page was opened. */
const fetchedAt = Date.now() - (3 * 60 + 12) * 1000;
/** The Last-Modified of the song list's data. */
const genetUpdatedAt = Date.parse('2025-05-29T21:57:45Z');

/** The site's pages, linked to this preview with the rest of the query kept. */
const navItems: NavItem[] = SITE_PAGES.map((item) => {
  const next = new URLSearchParams(query);
  next.set('page', item.id);
  return { ...item, href: `?${next}` };
});
if (query.get('items') === '8') {
  for (let i = 1; i <= 3; i++) navItems.push({ id: `placeholder-${i}`, label: `仮のページ ${i}`, href: '#' });
}
</script>

<template>
  <SiteShell :page="pageId" :title="page.title" :nav-items="navItems">
    <template #title-aside>
      <UpdatedAt
        :at="isGenet ? genetUpdatedAt : fetchedAt"
        :state
        :pulse="!isGenet"
        :date-only="isGenet"
        :age="isGenet ? 'calendar' : 'recent'"
      />
    </template>

    <div class="preview-body" :class="{ loading: state === 'loading' }">
      <div v-for="(row, r) in page.rows" :key="r" class="row" :class="row.layout">
        <div
          v-for="(height, p) in row.panels"
          :key="p"
          class="panel"
          :class="{ flat: height === 'flat' }"
          :style="height === 'flat' ? undefined : { height: `${height}px` }"
          aria-hidden="true"
        ></div>
      </div>
    </div>

    <template #notes>
      <li v-for="(note, n) in page.notes" :key="n">
        <template v-if="note.link"
          >{{ note.link.before }}<a :href="note.link.href" target="_blank" rel="noopener">{{ note.link.label }}</a
          >{{ note.link.after }}</template
        >
        <template v-else>{{ note.text }}</template>
      </li>
    </template>
  </SiteShell>
</template>

<style scoped>
.preview-body,
.row {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.panel {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background:
    repeating-linear-gradient(to bottom, var(--k-accent) 0 34px, transparent 34px 52px) content-box 0 0 / 60px 100%
      no-repeat,
    repeating-linear-gradient(to bottom, transparent 0 6px, var(--k-track) 6px 14px, transparent 14px 26px) content-box
      72px 0 / calc(100% - 72px) 100% no-repeat,
    var(--k-surface);
  box-shadow: var(--k-shadow);
}

.panel.flat {
  height: 34px;
  padding: 6px 0;
  border: 0;
  background: repeating-linear-gradient(to right, var(--k-track) 0 64px, transparent 64px 72px) content-box;
  box-shadow: none;
}

.loading .panel {
  animation: preview-breathe 1.6s ease infinite;
}

@keyframes preview-breathe {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

.footprints {
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 22px;
}

.stats {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr);
  gap: 14px;
}

.members {
  grid-template-columns: minmax(0, 1fr) 456px;
}

.members-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.videos {
  grid-template-columns: minmax(0, 1fr) 380px;
}

.genet {
  grid-template-columns: 340px 430px minmax(0, 1fr);
}

@container (max-width: 1120px) {
  .members,
  .members-3 {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 1099px) {
  .genet {
    grid-template-columns: 300px minmax(0, 1fr);
  }

  .genet > :nth-child(3) {
    display: none;
  }
}

@container (max-width: 1040px) {
  .footprints {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .footprints > :nth-child(2) {
    display: none;
  }
}

@container (max-width: 900px) {
  .stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats > :nth-child(2) {
    display: none;
  }
}

@container (max-width: 860px) {
  .videos {
    grid-template-columns: minmax(0, 1fr);
  }

  .videos > :nth-child(2) {
    display: none;
  }
}

@container (max-width: 720px) {
  .genet {
    grid-template-columns: minmax(0, 1fr);
  }

  .genet > :nth-child(2) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading .panel {
    animation: none;
  }
}
</style>
