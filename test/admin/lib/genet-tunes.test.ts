import {
  ATTR_NAMES,
  attrNameOptions,
  emptyFormFields,
  fieldForSaveError,
  learnedNames,
  learnName,
  toFormFields,
  type GenetTune,
} from '@/admin/lib/genet-tunes';

// This project's own test environment is plain node, with no `localStorage`
// global - unlike a browser, or the worker project's own workerd. A minimal
// stand-in is enough: learnedNames/learnName only ever call getItem/setItem.
function fakeLocalStorage(): Storage {
  const store = new Map<string, string>();

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => void store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.stubGlobal('localStorage', fakeLocalStorage());

const TUNE: GenetTune = {
  tuneId: 1,
  title: '曲名',
  originalTitle: 'Original',
  subtunes: ['小曲1'],
  attributes: [{ name: '作曲', text: null, people: [{ personId: 1, creditedAs: 'A', note: null }] }],
  videos: [{ videoId: 'abcdefghijk', title: '演奏動画', startSeconds: 10, description: null }],
  scores: [{ url: 'https://imslp.org/x', title: '楽譜' }],
  memo: 'メモ',
};

describe('toFormFields', () => {
  test('carries every field over, as independent copies', () => {
    const fields = toFormFields(TUNE);

    expect(fields).toEqual({
      title: '曲名',
      originalTitle: 'Original',
      subtunes: ['小曲1'],
      attributes: TUNE.attributes,
      videos: TUNE.videos,
      scores: TUNE.scores,
      memo: 'メモ',
    });
    expect(fields.subtunes).not.toBe(TUNE.subtunes);
    expect(fields.attributes).not.toBe(TUNE.attributes);
    expect(fields.attributes[0]).not.toBe(TUNE.attributes[0]);
  });
});

describe('emptyFormFields', () => {
  test('starts with every array empty and every optional field null', () => {
    expect(emptyFormFields()).toEqual({
      title: '',
      originalTitle: null,
      subtunes: [],
      attributes: [],
      videos: [],
      scores: [],
      memo: null,
    });
  });
});

describe('fieldForSaveError', () => {
  test.each([
    ['title must not be empty', 'title', null],
    ['originalTitle must be a string or null', 'originalTitle', null],
    ['subtunes must be an array of strings', 'subtunes', null],
    ['memo must be a string or null', 'memo', null],
    ['attributes must be an array', 'attributes', null],
    ['each attribute must be an object', 'attributes', null],
    ['videos must be an array', 'videos', null],
    ['video videoId must be a string', 'videos', null],
    ['scores must be an array', 'scores', null],
    ['score url must be a string', 'scores', null],
  ])('maps %s to section %s with no index', (message, section, index) => {
    expect(fieldForSaveError(message)).toEqual({ section, index });
  });

  test.each([
    ['attributes[2].name must not be empty', 'attributes', 2],
    ['attributes[0].people[1].creditedAs must not be empty', 'attributes', 0],
    ['videos[3].startSeconds must be 0 or more', 'videos', 3],
    ['scores[1].url must start with https://', 'scores', 1],
  ])('maps %s to section %s with index %s', (message, section, index) => {
    expect(fieldForSaveError(message)).toEqual({ section, index });
  });

  test('answers null for a message naming no field this screen tracks', () => {
    expect(fieldForSaveError('unknown personIds: 9, 10')).toBeNull();
  });
});

describe('learnedNames and learnName', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('starts empty', () => {
    expect(learnedNames()).toEqual([]);
  });

  test('remembers a new name for next time', () => {
    learnName('弾き語り編曲');

    expect(learnedNames()).toEqual(['弾き語り編曲']);
  });

  test('does not duplicate a name already in ATTR_NAMES or already learned', () => {
    learnName(ATTR_NAMES[0]);
    learnName('弾き語り編曲');
    learnName('弾き語り編曲');

    expect(learnedNames()).toEqual(['弾き語り編曲']);
  });

  test('ignores a blank name', () => {
    learnName('   ');

    expect(learnedNames()).toEqual([]);
  });
});

describe('attrNameOptions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('starts with just ATTR_NAMES when nothing is learned and current is null', () => {
    expect(attrNameOptions(null)).toEqual([...ATTR_NAMES]);
  });

  test('adds a learned name after the fixed list', () => {
    learnName('弾き語り編曲');

    expect(attrNameOptions(null)).toEqual([...ATTR_NAMES, '弾き語り編曲']);
  });

  test('puts a one-off current value first when it matches neither', () => {
    expect(attrNameOptions('一度きりの名前')).toEqual(['一度きりの名前', ...ATTR_NAMES]);
  });

  test('does not duplicate a current value that is already a known name', () => {
    expect(attrNameOptions(ATTR_NAMES[0])).toEqual([...ATTR_NAMES]);
  });
});
