import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function verify(change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-import-integrity-'));
  const put = (name, data) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data));
  };
  const manifest = {course_count: 1, page_count: 1, expected_page_count: 1, challenge_count: 1, reference_count: 1, resolved_reference_count: 1, failures: []};
  try {
    put('scripts/import-verify.py', fs.readFileSync(new URL('../scripts/import-verify.py', import.meta.url), 'utf8'));
    put('public/content/catalog.json', {courses: [{course_no: '001'}]});
    put('public/content/courses/001.json', {toc: {categories: [{pages: [{id: 1}]}]}});
    put('public/content/pages/001-1.json', {components: [{type: 'CodeChallengeRef', content: {challenge_id: 1}, resolved: {title: 'Example'}}], media: '/content/fixtures/nested/example.html'});
    put('public/content/challenges/1.json', {title: 'Example'});
    put('public/content/fixtures/nested/example.html', '<p>Local example</p>');
    put('public/content/media-index.json', {});
    change({root, put, manifest});
    put('public/content/manifest.json', manifest);
    const result = spawnSync('python3', [path.join(root, 'scripts/import-verify.py')], {encoding: 'utf8'});
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    return {exitCode: result.status, report: JSON.parse(result.stdout)};
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

test('integrity audit accepts complete referenced content including nested resource paths', () => {
  const {exitCode, report} = verify();
  assert.equal(exitCode, 0);
  assert.equal(report.verified, true);
  assert.equal(report.counts.reference_resources, 1);
});

test('integrity audit fails on missing nested media rather than checking only its first path segment', () => {
  const {exitCode, report} = verify(({root}) => fs.unlinkSync(path.join(root, 'public/content/fixtures/nested/example.html')));
  assert.equal(exitCode, 1);
  assert.ok(report.errors.includes('Missing local media: /content/fixtures/nested/example.html'));
});

test('integrity audit fails on omitted challenges and unresolved source imports', () => {
  const {exitCode, report} = verify(({manifest}) => {
    manifest.challenge_count = 2;
    manifest.reference_count = 2;
    manifest.resolved_reference_count = 2;
    manifest.failures = [{url: 'https://example.invalid/source', reason: 'unavailable'}];
  });
  assert.equal(exitCode, 1);
  assert.ok(report.errors.includes('Challenge count differs from manifest'));
  assert.ok(report.errors.includes('Reference resource count differs from manifest'));
  assert.ok(report.errors.includes('Not all expected references were resolved'));
  assert.ok(report.errors.includes('Source import manifest contains unresolved failures'));
});

test('integrity audit rejects duplicate and omitted lessons', () => {
  const {exitCode, report} = verify(({put, manifest}) => {
    put('public/content/courses/001.json', {toc: {categories: [{pages: [{id: 1}, {id: 1}]}]}});
    manifest.page_count = 2;
    manifest.expected_page_count = 3;
  });
  assert.equal(exitCode, 1);
  assert.ok(report.errors.includes('Duplicate course lesson: 001-1'));
  assert.ok(report.errors.includes('Not all expected pages were imported'));
});


test('live source comparison detects missing nulls, empty container changes and scalar types', () => {
  const source = `
import sys
sys.path.insert(0, sys.argv[1])
from source_json_diff import changed_fields
assert changed_fields({}, {'new': None}) == ['/new']
assert changed_fields({'items': {}}, {'items': []}) == ['/items']
assert changed_fields({'answer': True}, {'answer': 1}) == ['/answer']
assert changed_fields({'items': []}, {'items': [1]}) == ['/items']
assert changed_fields({'a/b': []}, {'a/b': [1]}) == ['/a~1b']
assert changed_fields({'items': [{}]}, {'items': [{}]}) == []
`;
  const result = spawnSync('python3', ['-c', source, new URL('../scripts', import.meta.url).pathname], {encoding: 'utf8'});
  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});

test('integrity audit rejects unresolved reference aliases', () => {
  const {exitCode, report} = verify(({put}) => {
    put('public/content/pages/001-1.json', {components: [{type: 'CodeChallengeRef', content: {challenge_id: 1}}]});
  });
  assert.equal(exitCode, 1);
  assert.ok(report.errors.includes('001-1: unresolved CodeChallengeRef'));
});
