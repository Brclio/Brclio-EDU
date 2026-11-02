import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const audit = read('./content-fidelity-audit.json');

test('complete source field comparison records no missing or changed course content', () => {
  assert.equal(audit.summary.courses, 28);
  assert.equal(audit.summary.pages, 1190);
  assert.equal(audit.summary.challenges, 479);
  assert.equal(audit.rawComparison.totalReferenceResources, 2805);
  assert.equal(audit.summary.sourceScalarFields, 345606);
  assert.equal(audit.summary.sourceExactFields + audit.summary.sourceLocalizedFields, audit.summary.sourceScalarFields);
  assert.deepEqual(audit.errors, []);
  assert.deepEqual(audit.rawComparison.issues, []);
  assert.deepEqual(audit.catalogComparison.issues, []);
  if (audit.liveScope === 'all-cached-public-endpoints') {
    assert.equal(audit.summary.liveRequests, audit.liveExpectedRequests);
    assert.equal(audit.summary.liveRequests, 1 + 28 + 1190 + 2805);
  } else assert.ok([0, 85].includes(audit.summary.liveRequests));
  assert.equal(audit.summary.liveChanged, 0);
  assert.equal(audit.summary.liveErrors, 0);
  for (const endpoint of audit.live) {
    assert.equal(endpoint.liveCanonicalSha256, endpoint.cachedCanonicalSha256, endpoint.api);
  }
});

test('local resources, nested SVG dependencies and original video chunks are intact', () => {
  assert.deepEqual(audit.localMissing, []);
  assert.deepEqual(audit.renderExternal, []);
  assert.deepEqual(audit.svgExternal, []);
  assert.equal(audit.streamedMedia.length, 2);
  for (const media of audit.streamedMedia) {
    assert.equal(media.matchesIndex, true);
    assert.equal(media.originalCacheMatches, true);
  }
  assert.deepEqual(audit.mediaValidation.issues, []);
  // The source course assets remain required; locally mirrored site UI may add images.
  assert.ok(audit.mediaValidation.counts.raster >= 1292);
  assert.equal(audit.mediaValidation.videos.length, 9);
});

test('fixture bytes match the audit and adapted resources remain explicitly identified', () => {
  assert.equal(audit.fixtureSummary.aliases, 34);
  assert.equal(audit.fixtureBodies.length, 27);
  const classes = audit.fixtureSummary.classification;
  assert.equal(classes['adapted-teaching-response'], 2);
  assert.equal(classes['adapted-endpoint'], 1);
  assert.equal(classes['reconstructed-from-course-evidence'], 1);
  for (const body of audit.fixtureBodies) {
    const file = new URL('../public' + body.path, import.meta.url);
    assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), body.sha256, body.path);
    if (body.raw) assert.equal(body.raw.matchesRecorded, true);
    if (body.classification.startsWith('adapted') || body.classification.startsWith('reconstructed')) {
      assert.equal(body.historicalIdentityClaimed, false);
    }
  }
});

test('isolated full import keeps fixed URLs, exact response bodies and every animation frame', () => {
  const report = read('./content-import-reproduction.json');
  assert.equal(report.exitCode, 0);
  assert.equal(report.finalFixtureMapEntries, 34);
  assert.deepEqual(report.lostFixtureUrls, []);
  assert.deepEqual(report.changedFixtureBodies, []);
  assert.deepEqual(report.animationSummary, {animations: 163, frames: 964});
  assert.deepEqual(report.animationErrors, []);
  assert.equal(report.everyReproducedFrameMatchesSourceBytes, true);
  assert.equal(report.reproducedFidelitySummary.errors, 0);
});

test('actual lesson HTML does not use the 103 external site-wide CSS icons', () => {
  const css = read('./content-css-dependency-audit.json');
  assert.equal(css.cssUniqueUrls, 103);
  assert.deepEqual(css.externalRequests, []);
  assert.equal(css.rows.length, 2);
  for (const row of css.rows) assert.deepEqual(row.cssImageUsage, []);
});

test('four teaching links resolve to local HTML in an independent tab', () => {
  const links = read('./content-teaching-links-audit.json');
  assert.equal(links.failures, 0);
  assert.equal(links.rows.length, 4);
  for (const row of links.rows) {
    assert.equal(row.status, 200);
    assert.equal(row.target, '_blank');
    assert.equal(row.popupOpened, true);
    assert.match(row.href, /^\/content\/fixtures\//);
    assert.ok(row.title);
  }
});
