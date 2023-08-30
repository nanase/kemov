import type { Streaming } from '@/types/genet';
import { escapeRegex } from '@/lib/string';

const conversionTable: [string, string][] = [
  ['バ', 'ヴァ'],
  ['ビ', 'ヴィ'],
  ['ブ', 'ヴ'],
  ['ベ', 'ヴェ'],
  ['ボ', 'ヴォ'],
];

export class StreamingSearch {
  private initialized: boolean = false;
  private conversionRegex: { regex: RegExp; replace: string }[] = [];

  private initialize() {
    if (this.initialized) {
      return;
    }

    for (const conversion of conversionTable) {
      const [a, b] = conversion;
      this.conversionRegex.push({
        regex: new RegExp(`(${escapeRegex(a)}|${escapeRegex(b)})`, 'g'),
        replace: `(${escapeRegex(a)}|${escapeRegex(b)})`,
      });
    }

    this.initialized = true;
  }

  private convertWord(query: string): string {
    for (const conversion of this.conversionRegex) {
      query = query.replaceAll(conversion.regex, conversion.replace);
    }

    return query;
  }

  public search(rawStreamings: Streaming[], queryText: string): Streaming[] {
    this.initialize();

    return queryText.split(/\s/).reduce((streamings, query) => {
      const escapedQuery = this.convertWord(escapeRegex(query));
      const regex = new RegExp(escapedQuery, 'i');

      return streamings.filter(
        (streaming) =>
          regex.test(streaming.shortname ?? streaming.name) ||
          streaming.categories?.some((category) => regex.test(category)) ||
          streaming.tunes
            .flatMap((tune) => [
              ...(tune.attributes?.map((attribute) => attribute.text) ?? []),
              ...(tune.subtunes ?? []),
              tune.title,
              tune.originalTitle ?? '',
              tune.description ?? '',
            ])
            .some((key) => regex.test(key)),
      );
    }, rawStreamings);
  }
}
