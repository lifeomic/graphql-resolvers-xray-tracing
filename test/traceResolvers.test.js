const traceResolvers = require('../src/traceResolvers');
const { graphql } = require('graphql');
const schema = require('./helpers/schema');
const nock = require('nock');
const test = require('ava');
const AWSXRay = require('aws-xray-sdk-core');
AWSXRay.capturePromise();
const retryPromise = require('promise-retry');

test.beforeEach(function (test) {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  const ns = AWSXRay.getNamespace();
  const segment = new AWSXRay.Segment('parent');

  test.context.segment = segment;
  traceResolvers(schema);
  test.context.graphql = ns.bind(function (query) {
    AWSXRay.setSegment(segment);
    return graphql(schema, query);
  });
});

test.afterEach.always(function (test) {
  nock.enableNetConnect();
  nock.cleanAll();
});

function waitForSegmentCount (test, count) {
  return retryPromise(function (retry, attempt) {
    try {
      const actualLength = test.context.segment.subsegments.length;
      if (actualLength !== count) {
        throw new Error(`Subsegment length was expected to be ${count} but was ${actualLength}`);
      }
    } catch (error) {
      retry(error);
    }
  }, { retries: 10, minTimeout: 10, maxTimeout: 100 });
}

test('Traced resolvers can return a value', async function (test) {
  const { graphql } = test.context;
  const result = await graphql('{ hello }');

  if (result.errors) {
    throw result.errors[0];
  }
  test.deepEqual(result, {
    data: {
      hello: 'world'
    }
  });
});

test('Trace segments are created for resolvers', async function (test) {
  const { segment, graphql } = test.context;
  await graphql('{ hello }');

  test.is(segment.subsegments.length, 1);
  test.is(segment.subsegments[0].name, 'GraphQL hello');
  test.falsy(segment.subsegments[0].in_progress);
  test.falsy(segment.subsegments[0].fault);
});

test('Trace segments are reported as errors when resolver throws an error synchronously', async function (test) {
  const { segment, graphql } = test.context;
  await graphql('{ throwsSynchronously }');

  test.is(segment.subsegments.length, 1);
  test.is(segment.subsegments[0].name, 'GraphQL throwsSynchronously');
  test.falsy(segment.subsegments[0].in_progress);
  test.truthy(segment.subsegments[0].fault);
});

async function testAsyncResolver (test, unblockQueryBuilder) {
  const { segment, graphql } = test.context;

  const createResult = await graphql('mutation { createBlocking }');
  const blockedId = createResult.data.createBlocking;

  test.is(segment.subsegments.length, 1);
  test.is(segment.subsegments[0].name, 'GraphQL createBlocking');
  test.falsy(segment.subsegments[0].in_progress);

  const blockingPromise = graphql(`{ waitFor(id: "${blockedId}") }`);
  await waitForSegmentCount(test, 2);
  test.is(segment.subsegments[1].name, 'GraphQL waitFor');
  test.truthy(segment.subsegments[1].in_progress);

  await Promise.all([
    blockingPromise,
    graphql(unblockQueryBuilder(blockedId))
  ]);

  test.is(segment.subsegments[1].name, 'GraphQL waitFor');
  test.falsy(segment.subsegments[1].in_progress);

  return segment.subsegments[1];
}

function resolveWithoutError (id) {
  return `mutation { resolve(id: "${id}") }`;
}

function resolveWithError (id) {
  return `mutation { reject(id: "${id}") }`;
}

test('Trace segments are closed when resolvers complete', async function (test) {
  const asyncSegment = await testAsyncResolver(test, resolveWithoutError);
  test.falsy(asyncSegment.fault);
});

test('Resolver errors cause the segment to be marked as an error', async function (test) {
  const asyncSegment = await testAsyncResolver(test, resolveWithError);
  test.truthy(asyncSegment.fault);
});

test('Trace segments are created for nested resolvers', async function (test) {
  const { segment, graphql } = test.context;
  await graphql('{ parent { name } }');

  test.is(segment.subsegments.length, 2);
  test.is(segment.subsegments[0].name, 'GraphQL parent');
  test.falsy(segment.subsegments[0].in_progress);
  test.falsy(segment.subsegments[0].fault);

  test.is(segment.subsegments[1].name, 'GraphQL parent.name');
  test.falsy(segment.subsegments[1].in_progress);
  test.falsy(segment.subsegments[1].fault);
});
