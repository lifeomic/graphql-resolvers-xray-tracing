import { graphql, ExecutionResult } from 'graphql';
import { traceSchema } from './helpers/schema';
import nock from 'nock';
import anyTest, { ExecutionContext, TestInterface } from 'ava';
import AWSXRay, { Segment, Subsegment } from 'aws-xray-sdk-core';
import retryPromise from 'promise-retry';
import { Mutation } from './__generated__/graphql';

AWSXRay.capturePromise();

type GraphQlQuery = Parameters<typeof graphql>[1];
type Namespace = ReturnType<typeof AWSXRay.getNamespace>;

interface TestContext {
  ns: Namespace;
  segment: Segment;
  graphql: <TData = Record<string, any>>(query: GraphQlQuery) => Promise<ExecutionResult<TData>>;
}

const test = anyTest as TestInterface<TestContext>;

test.beforeEach(function (test) {
  const schema = traceSchema();
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  const ns: Namespace = AWSXRay.getNamespace();
  test.context.ns = ns;

  const segment = new AWSXRay.Segment('parent');
  test.context.segment = segment;

  test.context.graphql = ns.bind(function <T = Record<string, any>> (query: GraphQlQuery) {
    AWSXRay.setSegment(segment);
    try {
      return graphql(schema, query) as Promise<ExecutionResult<T>>;
    } finally {
      segment.close();
    }
  });
});

test.afterEach.always(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

function waitForSegmentCount (test: ExecutionContext<TestContext>, count: number) {
  return retryPromise(async (retry) => {
    try {
      const actualLength = test.context.segment.subsegments!.length;
      if (actualLength !== count) {
        retry(new Error(`Subsegment length was expected to be ${count} but was ${actualLength}`));
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

  test.is(segment.subsegments?.length, 1);
  test.is(segment.subsegments![0].name, 'GraphQL hello');
  test.falsy(segment.subsegments![0].in_progress);
  // @ts-ignore
  test.falsy(segment.subsegments![0].fault);
});

test('Trace segments are reported as errors when resolver throws an error synchronously', async function (test) {
  const { segment, graphql } = test.context;
  await graphql('{ throwsSynchronously }');

  test.is(segment.subsegments?.length, 1);
  test.is(segment.subsegments![0].name, 'GraphQL throwsSynchronously');
  test.falsy(segment.subsegments![0].in_progress);
  // @ts-ignore
  test.truthy(segment.subsegments![0].fault);
});

test('Trace segments are reported as errors when resolver throws an error asynchronously', async function (test) {
  const { segment, graphql } = test.context;
  await graphql('{ throwsAsynchronously }');

  test.is(segment.subsegments?.length, 1);
  test.is(segment.subsegments![0].name, 'GraphQL throwsAsynchronously');
  test.falsy(segment.subsegments![0].in_progress);
  // @ts-ignore
  test.truthy(segment.subsegments![0].fault);
});

async function testAsyncResolver (test: ExecutionContext<TestContext>, unblockQueryBuilder: (id: string) => string): Promise<Subsegment> {
  const { segment, graphql } = test.context;

  const createResult = await graphql<Mutation>('mutation { createBlocking }');
  const blockedId = createResult.data!.createBlocking;

  test.is(segment.subsegments?.length, 1);
  test.is(segment.subsegments![0].name, 'GraphQL createBlocking');
  test.falsy(segment.subsegments![0].in_progress);

  const blockingPromise = graphql(`{ waitFor(id: "${blockedId}") }`);
  await waitForSegmentCount(test, 2);
  test.is(segment.subsegments![1].name, 'GraphQL waitFor');
  test.truthy(segment.subsegments![1].in_progress);

  await Promise.all([
    blockingPromise,
    graphql(unblockQueryBuilder(blockedId))
  ]);

  test.is(segment.subsegments![1].name, 'GraphQL waitFor');
  test.falsy(segment.subsegments![1].in_progress);

  return segment.subsegments![1];
}

function resolveWithoutError (id: string) {
  return `mutation { resolve(id: "${id}") }`;
}

function resolveWithError (id: string) {
  return `mutation { reject(id: "${id}") }`;
}

test('Trace segments are closed when resolvers complete', async function (test) {
  const asyncSegment = await testAsyncResolver(test, resolveWithoutError);
  // @ts-ignore
  test.falsy(asyncSegment.fault);
});

test('Resolver errors cause the segment to be marked as an error', async function (test) {
  const asyncSegment = await testAsyncResolver(test, resolveWithError);
  // @ts-ignore
  test.truthy(asyncSegment.fault);
});

test('Trace segments are created for nested resolvers', async function (test) {
  const { segment, graphql } = test.context;
  await graphql('{ parent { name } }');

  test.is(segment.subsegments?.length, 2);
  test.is(segment.subsegments![0].name, 'GraphQL parent');
  test.falsy(segment.subsegments![0].in_progress);
  // @ts-ignore
  test.falsy(segment.subsegments![0].fault);

  test.is(segment.subsegments![1].name, 'GraphQL parent.name');
  test.falsy(segment.subsegments![1].in_progress);
  // @ts-ignore
  test.falsy(segment.subsegments![1].fault);
});
