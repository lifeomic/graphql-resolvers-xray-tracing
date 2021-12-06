import { graphql, ExecutionResult } from 'graphql';
import { traceSchema } from './helpers/schema';
import nock from 'nock';
import AWSXRay, { Segment, Subsegment } from 'aws-xray-sdk-core';
import retryPromise from 'promise-retry';
import { Mutation } from './__generated__/graphql';

AWSXRay.capturePromise();

type GraphQlQuery = Parameters<typeof graphql>[1];
type Namespace = ReturnType<typeof AWSXRay.getNamespace>;

let ns: Namespace;
let segment: Segment;
let graphqlQuery: <TData = Record<string, any>>(query: GraphQlQuery) => Promise<ExecutionResult<TData>>;

beforeEach(() => {
  const schema = traceSchema();
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  ns = AWSXRay.getNamespace();

  segment = new AWSXRay.Segment('parent');

  graphqlQuery = ns.bind(<T = Record<string, any>>(query: GraphQlQuery) => {
    AWSXRay.setSegment(segment);
    try {
      return graphql(schema, query) as Promise<ExecutionResult<T>>;
    } finally {
      segment.close();
    }
  });
});

afterEach(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

const waitForSegmentCount = (count: number) => {
  // eslint-disable-next-line @typescript-eslint/require-await
  return retryPromise(async (retry) => {
    try {
      const actualLength = segment.subsegments!.length;
      if (actualLength !== count) {
        retry(new Error(`Subsegment length was expected to be ${count} but was ${actualLength}`));
      }
    } catch (error) {
      retry(error);
    }
  }, { retries: 10, minTimeout: 10, maxTimeout: 100 });
};

test('Traced resolvers can return a value', async () => {
  const result = await graphqlQuery('{ hello }');

  if (result.errors) {
    throw result.errors[0];
  }
  expect(result).toEqual({
    data: {
      hello: 'world',
    },
  });
});

test('Trace segments are created for resolvers', async () => {
  await graphqlQuery('{ hello }');

  expect(segment.subsegments?.length).toBe(1);
  expect(segment.subsegments![0].name).toBe('GraphQL hello');
  expect(segment.subsegments![0].in_progress).toBeFalsy();
  // @ts-expect-error Not expecting fault.
  expect(segment.subsegments![0].fault).toBeFalsy();
});

test('Trace segments are reported as errors when resolver throws an error synchronously', async () => {
  await graphqlQuery('{ throwsSynchronously }');

  expect(segment.subsegments?.length).toBe(1);
  expect(segment.subsegments![0].name).toBe('GraphQL throwsSynchronously');
  expect(segment.subsegments![0].in_progress).toBeFalsy();
  // @ts-expect-error Not expecting fault.
  expect(segment.subsegments![0].fault).toBeTruthy();
});

test('Trace segments are reported as errors when resolver throws an error asynchronously', async () => {
  await graphqlQuery('{ throwsAsynchronously }');

  expect(segment.subsegments?.length).toBe(1);
  expect(segment.subsegments![0].name).toBe('GraphQL throwsAsynchronously');
  expect(segment.subsegments![0].in_progress).toBeFalsy();
  // @ts-expect-error Not expecting fault.
  expect(segment.subsegments![0].fault).toBeTruthy();
});

const testAsyncResolver = async (unblockQueryBuilder: (id: string) => string): Promise<Subsegment & { fault?: any; }> => {
  const createResult = await graphqlQuery<Mutation>('mutation { createBlocking }');
  const blockedId = createResult.data!.createBlocking;

  expect(segment.subsegments?.length).toBe(1);
  expect(segment.subsegments![0].name).toBe('GraphQL createBlocking');
  expect(segment.subsegments![0].in_progress).toBeFalsy();

  const blockingPromise = graphqlQuery(`{ waitFor(id: "${blockedId}") }`);
  await waitForSegmentCount(2);
  expect(segment.subsegments![1].name).toBe('GraphQL waitFor');
  expect(segment.subsegments![1].in_progress).toBeTruthy();

  await Promise.all([
    blockingPromise,
    graphqlQuery(unblockQueryBuilder(blockedId)),
  ]);

  expect(segment.subsegments![1].name).toBe('GraphQL waitFor');
  expect(segment.subsegments![1].in_progress).toBeFalsy();

  return segment.subsegments![1];
};

const resolveWithoutError = (id: string) => {
  return `mutation { resolve(id: "${id}") }`;
};

const resolveWithError = (id: string) => {
  return `mutation { reject(id: "${id}") }`;
};

test('Trace segments are closed when resolvers complete', async () => {
  const asyncSegment = await testAsyncResolver(resolveWithoutError);
  expect(asyncSegment.fault).toBeFalsy();
});

test('Resolver errors cause the segment to be marked as an error', async () => {
  const asyncSegment = await testAsyncResolver(resolveWithError);
  expect(asyncSegment.fault).toBeTruthy();
});

test('Trace segments are created for nested resolvers', async () => {
  await graphqlQuery('{ parent { name } }');

  expect(segment.subsegments?.length).toBe(2);
  expect(segment.subsegments![0].name).toBe('GraphQL parent');
  expect(segment.subsegments![0].in_progress).toBeFalsy();
  // @ts-expect-error Not expecting fault.
  expect(segment.subsegments![0].fault).toBeFalsy();

  expect(segment.subsegments![1].name).toBe('GraphQL parent.name');
  expect(segment.subsegments![1].in_progress).toBeFalsy();
  // @ts-expect-error Not expecting fault.
  expect(segment.subsegments![1].fault).toBeFalsy();
});
