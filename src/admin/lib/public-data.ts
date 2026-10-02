import { getChannels, getMonths, getSubscriberMilestones, isNotPublished } from '@/lib/api';
import type { Channel, SubscriberMilestone } from '@/type/api';

/**
 * What the public API serves, read once for the previews. The admin site is
 * on the same origin as `/api`, which Cloudflare Access does not guard, so
 * these are the same reads a public page makes.
 *
 * A failed read is not kept: the next preview asks again.
 */
let channels: Promise<Channel[]> | null = null;
let milestones: Promise<SubscriberMilestone[]> | null = null;
let months: Promise<string[]> | null = null;

/** `slot` while it holds a read, else a new `load()`, kept through `keep` until it fails. */
function once<T>(slot: Promise<T> | null, load: () => Promise<T>, keep: (p: Promise<T> | null) => void): Promise<T> {
  if (slot !== null) return slot;

  const loading = load();

  keep(loading);
  loading.catch(() => keep(null));

  return loading;
}

/** Every member as the public pages read them, with the relay's icon address. */
export function publicChannels(): Promise<Channel[]> {
  return once(
    channels,
    async () => (await getChannels()).data.channels,
    (p) => (channels = p),
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
    (p) => (milestones = p),
  );
}

/** Every month the site knows, `YYYY-MM`, the axis the milestone chart is drawn on. */
export function publicMonths(): Promise<string[]> {
  return once(
    months,
    async () => (await getMonths()).data.months,
    (p) => (months = p),
  );
}
