import { describe, expect, it } from 'vitest';
import {
  buildFrontMatter,
  formatYamlScalar,
  frontMatterFromProperties,
  isSimpleFrontMatter,
  readFrontMatterProperties,
  serializeFrontMatterProperties,
  splitFrontMatter,
} from '../src/markdown/FrontMatter';

describe('readFrontMatterProperties', () => {
  it('reads scalars and lists', () => {
    expect(
      readFrontMatterProperties(`title: Sample doc
tags:
  - mdotion
  - test
status:`),
    ).toEqual([
      { key: 'title', value: 'Sample doc', kind: 'scalar' },
      { key: 'tags', value: 'mdotion, test', kind: 'list' },
      { key: 'status', value: '', kind: 'scalar' },
    ]);
  });

  it('unquotes scalars', () => {
    expect(readFrontMatterProperties(`title: 'A: B'`)).toEqual([{ key: 'title', value: 'A: B', kind: 'scalar' }]);
  });
});

describe('serializeFrontMatterProperties', () => {
  it('round-trips simple front matter used in the fixture', () => {
    const yaml = `title: Sample doc
tags:
  - mdotion
  - test`;
    const properties = readFrontMatterProperties(yaml);
    expect(serializeFrontMatterProperties(properties)).toBe(yaml);
    expect(isSimpleFrontMatter(yaml)).toBe(true);
  });

  it('quotes values that need it', () => {
    expect(formatYamlScalar('A: B')).toBe("'A: B'");
    expect(formatYamlScalar('plain')).toBe('plain');
    expect(
      serializeFrontMatterProperties([{ key: 'title', value: 'A: B', kind: 'scalar' }]),
    ).toBe("title: 'A: B'");
  });

  it('builds fences or null', () => {
    expect(frontMatterFromProperties([])).toBeNull();
    expect(frontMatterFromProperties([{ key: 'title', value: 'X', kind: 'scalar' }])).toBe('---\ntitle: X\n---\n');
    expect(buildFrontMatter('')).toBe('---\n---\n');
  });
});

describe('isSimpleFrontMatter', () => {
  it('rejects nested maps and multiline scalars', () => {
    expect(
      isSimpleFrontMatter(`meta:
  author: Ada`),
    ).toBe(false);
    expect(
      isSimpleFrontMatter(`body: |
  hello`),
    ).toBe(false);
  });
});

describe('splitFrontMatter with property edits', () => {
  it('keeps the body when properties are rewritten', () => {
    const original = `---
title: Sample doc
tags:
  - mdotion
  - test
---

# Body
`;
    const { frontMatter, body } = splitFrontMatter(original);
    const next = frontMatterFromProperties(
      readFrontMatterProperties(frontMatter!).map((row) =>
        row.key === 'title' ? { ...row, value: 'Renamed' } : row,
      ),
    );
    expect(next).toBe(`---
title: Renamed
tags:
  - mdotion
  - test
---
`);
    expect(body).toBe('\n# Body\n');
  });
});
