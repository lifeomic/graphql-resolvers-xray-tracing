import { graphql, GraphQLError, Source } from 'graphql';
import { traceSchema } from './helpers/schema';
import nock from 'nock';
import anyTest, { TestInterface } from 'ava';
import AWSXRay from 'aws-xray-sdk-core';
import { ExecutionResult, ExecutionResultDataDefault } from 'graphql/execution/execute';
AWSXRay.setContextMissingStrategy('LOG_ERROR');
AWSXRay.setLogger({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
});
AWSXRay.capturePromise();

type GraphQlQuery = Parameters<typeof graphql>[1];

const source = new Source('', '', {
  column: 3,
  line: 1
});

interface TestContext {
  graphql: <TData = ExecutionResultDataDefault>(query: GraphQlQuery) => Promise<ExecutionResult<TData>>;
}

const test = anyTest as TestInterface<TestContext>;

test.beforeEach((t) => {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
  const schema = traceSchema();

  t.context.graphql = (query) => graphql(schema, query);
});

test.afterEach.always(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

test('Traced resolvers can return a value', async (t) => {
  const { graphql } = t.context;
  const result = await graphql('{ hello }');

  if (result.errors) {
    throw result.errors[0];
  }
  t.deepEqual(result, {
    data: {
      hello: 'world'
    }
  });
});

test('Traced resolvers will throw exceptions when throwsSynchronously', async (t) => {
  const { graphql } = t.context;
  const result = await graphql('{ throwsSynchronously }');

  const expected = new GraphQLError('Some error', undefined, source, [2], ['throwsSynchronously']);
  t.is(result.errors?.length, 1);
  t.deepEqual(result.errors, [expected]);
});

test('Traced resolvers will throw exceptions when throwsAsynchronously', async (t) => {
  const { graphql } = t.context;
  const result = await graphql('{ throwsAsynchronously }');

  const expected = new GraphQLError('Some error', undefined, source, [2], ['throwsAsynchronously']);
  t.is(result.errors?.length, 1);
  t.deepEqual(result.errors, [expected]);
});
