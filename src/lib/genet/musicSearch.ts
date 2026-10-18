/**
 * さがす・面ごとの絞り込み (#139, #144's genet music page).
 *
 * HQ's decision (2026-09-19): a stream matches only when one of its own
 * performances satisfies every search term on its own (that performance's
 * text, or the stream's shared text) - not the old page's per-word filter over
 * the whole stream (removed in #144), where two different
 * words each hitting a different tune still passed the stream through. This
 * file's `computeResults` mirrors the confirmed mock's own `compute()`.
 */
import { normalize, type SearchTerm } from '@/lib/search';

import type { GenetMusicData, GenetPerformance, GenetScene, GenetStream, GenetTune } from './musicTypes';
import { plainText } from './musicMarkdown';

export interface PreparedPerformance {
  tune: GenetTune;
  description: string | null;
  scenes: GenetScene[];
  forms: ReadonlySet<string>;
  /** Normalized searchable text for this one occurrence: the tune's own title/original title/subtunes/attributes/credited people, plus this performance's own description. */
  text: string;
}

export interface PreparedStream {
  stream: GenetStream;
  performances: PreparedPerformance[];
  /** Normalized searchable text shared by every performance in this stream: its title, short title and categories. */
  text: string;
}

/** Every performance's scene styles, deduplicated. */
function formsOf(scenes: readonly GenetScene[]): Set<string> {
  const forms = new Set<string>();

  for (const scene of scenes) forms.add(scene.style);

  return forms;
}

function tuneText(tune: GenetTune, peopleById: ReadonlyMap<number, string>): string {
  const bits: string[] = [plainText(tune.title), tune.original_title ? plainText(tune.original_title) : ''];

  for (const subtune of tune.subtunes) bits.push(plainText(subtune));

  for (const attr of tune.attributes) {
    bits.push(attr.name ?? '');
    if (attr.text) bits.push(plainText(attr.text));

    for (const person of attr.people) {
      const name = peopleById.get(person.person_id);

      if (name) bits.push(name);
      if (person.credited_as) bits.push(person.credited_as);
    }
  }

  return normalize(bits.join('\n'));
}

/**
 * Every stream, with the text each of its performances is matched against
 * already computed - built once per data load, not once per keystroke.
 */
export function prepareStreams(data: GenetMusicData): PreparedStream[] {
  const tunesById = new Map(data.tunes.map((t) => [t.tune_id, t]));
  const peopleById = new Map(data.people.map((p) => [p.person_id, p.name]));
  const tuneTextById = new Map(data.tunes.map((t) => [t.tune_id, tuneText(t, peopleById)]));

  return data.streams.map((stream) => {
    const streamText = normalize(
      [plainText(stream.title), stream.short_title ? plainText(stream.short_title) : '', ...stream.categories].join(
        '\n',
      ),
    );

    const performances: PreparedPerformance[] = stream.performances
      .map((perf: GenetPerformance): PreparedPerformance | null => {
        const tune = tunesById.get(perf.tune_id);

        if (!tune) return null;

        const base = tuneTextById.get(perf.tune_id) ?? '';
        const withDescription = perf.description ? `${base}\n${normalize(plainText(perf.description))}` : base;

        return {
          tune,
          description: perf.description,
          scenes: perf.scenes,
          forms: formsOf(perf.scenes),
          text: withDescription,
        };
      })
      .filter((p): p is PreparedPerformance => p !== null);

    return { stream, performances, text: streamText };
  });
}

export interface Filters {
  terms: SearchTerm[];
  form: string | null;
  year: number | null;
  category: string | null;
}

export interface ComputeResult {
  /** Streams with at least one matching performance, in the input's own order. */
  streams: PreparedStream[];
  /** `video_id` -> the tune_ids of performances that matched via their own text (not only via the shared stream text) - the ".hits" summary line. */
  hitTuneIdsByStream: Map<string, number[]>;
  /** `video_id` -> the tune_ids of every matching performance, for marking which rows to show/keep open within a selected stream. */
  matchedTuneIdsByStream: Map<string, Set<number>>;
  /** Every distinct tune_id matched, across every stream. */
  songIds: Set<number>;
}

/** JST calendar year a published_at (UTC) instant falls in. */
export function yearOf(publishedAtUtc: string): number {
  const ms = Date.parse(publishedAtUtc) + 9 * 60 * 60 * 1000;

  return new Date(ms).getUTCFullYear();
}

export function isFiltering(filters: Filters): boolean {
  return filters.terms.length > 0 || filters.form !== null || filters.year !== null || filters.category !== null;
}

/** Every stream/performance passing `filters`, and the bookkeeping the panes need to render highlights and counts. */
export function computeResults(streams: readonly PreparedStream[], filters: Filters): ComputeResult {
  const result: ComputeResult = {
    streams: [],
    hitTuneIdsByStream: new Map(),
    matchedTuneIdsByStream: new Map(),
    songIds: new Set(),
  };

  for (const prepared of streams) {
    if (filters.year !== null && yearOf(prepared.stream.published_at) !== filters.year) continue;
    if (filters.category !== null && !prepared.stream.categories.includes(filters.category)) continue;

    let any = false;
    const matched = new Set<number>();
    const hits: number[] = [];

    for (const perf of prepared.performances) {
      let ok = filters.form === null || perf.forms.has(filters.form);

      if (ok) {
        for (const term of filters.terms) {
          if (!term.test(perf.text) && !term.test(prepared.text)) {
            ok = false;
            break;
          }
        }
      }

      if (!ok) continue;

      any = true;
      matched.add(perf.tune.tune_id);
      result.songIds.add(perf.tune.tune_id);

      if (filters.terms.length > 0 && filters.terms.some((t) => t.test(perf.text))) hits.push(perf.tune.tune_id);
    }

    if (any) {
      result.streams.push(prepared);
      result.matchedTuneIdsByStream.set(prepared.stream.video_id, matched);
      if (hits.length > 0) result.hitTuneIdsByStream.set(prepared.stream.video_id, hits);
    }
  }

  return result;
}

/**
 * `index`, moved back by one when it currently falls between a surrogate
 * pair's two halves - `text.slice()` at that offset would otherwise split
 * one character in two, leaving a lone surrogate at the start of the result.
 */
function surrogateSafeIndex(text: string, index: number): number {
  const code = text.charCodeAt(index);

  return code >= 0xdc00 && code <= 0xdfff ? index - 1 : index;
}

/**
 * `text` shortened to keep the first match visible when the whole thing is
 * cut to one line - without this, a hit late in a long sentence would be
 * trimmed away before a reader ever sees it.
 */
export function snippet(text: string, terms: readonly SearchTerm[]): string {
  if (terms.length === 0) return text;

  const normalized = normalize(text);

  if (normalized.length !== text.length) return text;

  let at = -1;

  for (const term of terms) {
    const index = term.indexOf(normalized);

    if (index >= 0 && (at < 0 || index < at)) at = index;
  }

  return at > 14 ? `…${text.slice(surrogateSafeIndex(text, at - 6))}` : text;
}
