/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect } from 'chai';
import { IndexedDbPersistence } from '../../../src/local/indexeddb_persistence';
import { filter, orderBy, path } from '../../util/helpers';
import * as persistenceHelpers from './persistence_test_helpers';
import { TestBundleCache } from './test_bundle_cache';
import { SnapshotVersion } from '../../../src/core/snapshot_version';
import { Timestamp } from '../../../src/api/timestamp';
import { Query } from '../../../src/core/query';
import { JSON_SERIALIZER } from './persistence_test_helpers';
import { ResourcePath } from '../../../src/model/path';
import { NamedQuery } from '../../../src/core/bundle';

describe('MemoryBundleCache', () => {
  let cache: TestBundleCache;

  beforeEach(async () => {
    cache = await persistenceHelpers
      .testMemoryEagerPersistence()
      .then(persistence => new TestBundleCache(persistence));
  });

  genericBundleCacheTests(() => cache);
});

describe('IndexedDbBundleCache', () => {
  if (!IndexedDbPersistence.isAvailable()) {
    console.warn('No IndexedDB. Skipping IndexedDbBundleCache tests.');
    return;
  }

  let cache: TestBundleCache;
  let persistence: IndexedDbPersistence;
  beforeEach(async () => {
    persistence = await persistenceHelpers.testIndexedDbPersistence({
      synchronizeTabs: true
    });
    cache = new TestBundleCache(persistence);
  });

  afterEach(async () => {
    await persistence.shutdown();
    await persistenceHelpers.clearTestPersistence();
  });

  genericBundleCacheTests(() => cache);
});

/**
 * Defines the set of tests to run against both bundle cache implementations.
 */
function genericBundleCacheTests(cacheFn: () => TestBundleCache): void {
  let cache: TestBundleCache;

  beforeEach(async () => {
    cache = cacheFn();
  });

  function verifyNamedQuery(
    actual: NamedQuery,
    expectedName: string,
    expectedQuery: Query,
    expectedReadSeconds: number,
    expectedReadNanos: number
  ) {
    expect(actual.name).to.equal(expectedName);
    expect(actual.query.isEqual(expectedQuery)).to.be.true;
    expect(
      actual.readTime.isEqual(
        SnapshotVersion.fromTimestamp(
          new Timestamp(expectedReadSeconds, expectedReadNanos)
        )
      )
    ).to.be.true;
  }

  it('returns undefined when bundle id is not found', async () => {
    expect(await cache.getBundle('bundle-1')).to.be.undefined;
  });

  it('returns saved bundle', async () => {
    await cache.saveBundleMetadata({
      id: 'bundle-1',
      version: 1,
      createTime: { seconds: 1, nanos: 9999 }
    });
    expect(await cache.getBundle('bundle-1')).to.deep.equal({
      id: 'bundle-1',
      version: 1,
      createTime: SnapshotVersion.fromTimestamp(new Timestamp(1, 9999))
    });

    // Overwrite
    await cache.saveBundleMetadata({
      id: 'bundle-1',
      version: 2,
      createTime: { seconds: 2, nanos: 1111 }
    });
    expect(await cache.getBundle('bundle-1')).to.deep.equal({
      id: 'bundle-1',
      version: 2,
      createTime: SnapshotVersion.fromTimestamp(new Timestamp(2, 1111))
    });
  });

  it('returns undefined when query name is not found', async () => {
    expect(await cache.getNamedQuery('query-1')).to.be.undefined;
  });

  it('returns saved collection queries', async () => {
    const query = Query.atPath(path('collection'))
      .addFilter(filter('sort', '>=', 2))
      .addOrderBy(orderBy('sort'));
    const queryTarget = JSON_SERIALIZER.toQueryTarget(query.toTarget());

    await cache.setNamedQuery({
      name: 'query-1',
      readTime: { seconds: 1, nanos: 9999 },
      bundledQuery: {
        parent: queryTarget.parent,
        structuredQuery: queryTarget.structuredQuery
      }
    });

    const namedQuery = await cache.getNamedQuery('query-1');
    verifyNamedQuery(namedQuery!, 'query-1', query, 1, 9999);
  });

  it('returns saved collection group queries', async () => {
    const query = new Query(ResourcePath.EMPTY_PATH, 'collection');
    const queryTarget = JSON_SERIALIZER.toQueryTarget(query.toTarget());

    await cache.setNamedQuery({
      name: 'query-1',
      readTime: { seconds: 1, nanos: 9999 },
      bundledQuery: {
        parent: queryTarget.parent,
        structuredQuery: queryTarget.structuredQuery,
        limitType: undefined
      }
    });

    const namedQuery = await cache.getNamedQuery('query-1');
    verifyNamedQuery(namedQuery!, 'query-1', query, 1, 9999);
  });

  it('returns expected limit queries', async () => {
    const query = Query.atPath(path('collection'))
      .addOrderBy(orderBy('sort'))
      .withLimitToFirst(3);
    const queryTarget = JSON_SERIALIZER.toQueryTarget(query.toTarget());

    await cache.setNamedQuery({
      name: 'query-1',
      readTime: { seconds: 1, nanos: 9999 },
      bundledQuery: {
        parent: queryTarget.parent,
        structuredQuery: queryTarget.structuredQuery,
        limitType: 'FIRST'
      }
    });

    const namedQuery = await cache.getNamedQuery('query-1');
    verifyNamedQuery(namedQuery!, 'query-1', query, 1, 9999);
  });

  it('returns expected limit to last queries', async () => {
    const query = Query.atPath(path('collection'))
      .addOrderBy(orderBy('sort'))
      .withLimitToLast(3);
    // Simulating bundle building for limit-to-last queries from the server
    // SDKs: they save the equivelent limit-to-first queries with a limitType
    // value 'LAST'. Client SDKs should apply a withLimitToLast when they see
    // limitType 'LAST' from bundles.
    const limitQuery = query.withLimitToFirst(3);
    const queryTarget = JSON_SERIALIZER.toQueryTarget(limitQuery.toTarget());

    await cache.setNamedQuery({
      name: 'query-1',
      readTime: { seconds: 1, nanos: 9999 },
      bundledQuery: {
        parent: queryTarget.parent,
        structuredQuery: queryTarget.structuredQuery,
        limitType: 'LAST'
      }
    });

    const namedQuery = await cache.getNamedQuery('query-1');
    verifyNamedQuery(namedQuery!, 'query-1', query, 1, 9999);
  });
}
