import { graphql, GraphQLError, Source } from 'graphql';
import { traceSchema } from './helpers/schema';
import nock from 'nock';
import AWSXRay from 'aws-xray-sdk-core';
import { ExecutionResult } from 'graphql/execution/execute';
AWSXRay.setContextMissingStrategy('LOG_ERROR');
AWSXRay.setLogger({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});
AWSXRay.capturePromise();

type GraphQlQuery = Parameters<typeof graphql>[1];

const source = new Source('', '', {
  column: 3,
  line: 1,
});

let graphqlQuery: <TData = Record<string, any>>(query: GraphQlQuery) => Promise<ExecutionResult<TData>>;

beforeEach(() => {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
  const schema = traceSchema();

  graphqlQuery = <T = Record<string, any>>(query: GraphQlQuery) => graphql(schema, query) as Promise<ExecutionResult<T>>;
});

afterEach(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

test('Traced resolvers can return a value', async () => {
  const result = await graphqlQuery('{ hello }');

  expect(result.errors).toBeUndefined();
  expect(result).toEqual({
    data: {
      hello: 'world',
    },
  });
});

test('Traced resolvers will throw exceptions when throwsSynchronously', async () => {
  const result = await graphqlQuery('{ throwsSynchronously }');

  const expected = new GraphQLError('Some error', undefined, source, [2], ['throwsSynchronously']);
  expect(result.errors).toHaveLength(1);
  expect(result.errors).toStrictEqual([expected]);
});

test('Traced resolvers will throw exceptions when throwsAsynchronously', async () => {
  const result = await graphqlQuery('{ throwsAsynchronously }');

  const expected = new GraphQLError('Some error', undefined, source, [2], ['throwsAsynchronously']);
  expect(result.errors).toHaveLength(1);
  expect(result.errors).toStrictEqual([expected]);
});
