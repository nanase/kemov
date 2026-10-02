import { getChannels, getMonths, getSubscriberMilestones, isNotPublished } from '@/lib/api';
import { readGenetMusicData } from '@/lib/genet/musicRead';
import type { GenetStream } from '@/lib/genet/musicTypes';
import type { Channel, SubscriberMilestone } from '@/type/api';

import { publicDataGeneration } from './preview';

/**
 * What the public API serves, read once for the previews. The admin site is
 * on the same origin as `/api`, which Cloudflare Access does not guard, so
 * these are the same reads a public page makes.
 *
 * A read is kept until it fails or `forgetPublicData` (lib/preview.ts) is
 * called after something this site changed was published, whichever comes
 * first; the next preview then asks again.
 */
interface Kept<T> {
  generation: number;
  read: Promise<T>;
}

let channels: Kept<Channel[]> | null = null;
let milestones: Kept<SubscriberMilestone[]> | null = null;
let months: Kept<string[]> | null = null;
let genetStreams: Kept<GenetStream[]> | null = null;

/** `slot`'s read while it is from the current generation, else a new `load()`, kept through `keep` until it fails. */
function once<T>(slot: Kept<T> | null, load: () => Promise<T>, keep: (kept: Kept<T> | null) => void): Promise<T> {
  const generation = publicDataGeneration();

  if (slot !== null && slot.generation === generation) return slot.read;

  const read = load();

  keep({ generation, read });
  read.catch(() => keep(null));

  return read;
}

/** Every member as the public pages read them, with the relay's icon address. */
export function publicChannels(): Promise<Channel[]> {
  return once(
    channels,
    async () => (await getChannels()).data.channels,
    (kept) => (channels = kept),
  );
}

/** The published milestones - none, rather than a failure, before the first publish. */
export function publicMilestones(): Promise<SubscriberMilestone[]> {
  return once(
    milestones,
    async () => {
      try {
        return (await getSubscriberMilestones()).data.milestones;
      } catch (error) {
        if (isNotPublished(error)) return [];

        throw error;
      }
    },
    (kept) => (milestones = kept),
  );
}

/** Every month the site knows, `YYYY-MM`, the axis the milestone chart is drawn on. */
export function publicMonths(): Promise<string[]> {
  return once(
    months,
    async () => (await getMonths()).data.months,
    (kept) => (months = kept),
  );
}

/**
 * The streams ジェネット楽曲一覧 lists, newest first - none, rather than a
 * failure, before the first publish. Read the way that page reads them, not
 * through `@/lib/api`, which has no reader for this body.
 */
export function publicGenetStreams(): Promise<GenetStream[]> {
  return once(
    genetStreams,
    async () => {
      const response = await fetch('/api/genet/music');

      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`/api/genet/music: ${response.status}`);

      return readGenetMusicData(await response.json()).streams;
    },
    (kept) => (genetStreams = kept),
  );
}
