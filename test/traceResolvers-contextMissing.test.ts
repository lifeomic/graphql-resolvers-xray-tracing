import traceResolvers from '../src/traceResolvers';
import { graphql } from 'graphql';
import schema from './helpers/schema';
import nock from 'nock';
import anyTest, { TestInterface } from 'ava';
import AWSXRay from 'aws-xray-sdk-core';
AWSXRay.setContextMissingStrategy('LOG_ERROR');
AWSXRay.setLogger({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
});
AWSXRay.capturePromise();

interface TestContext {
  graphql: (query: Parameters<typeof graphql>[1]) => ReturnType<typeof graphql>;
}

const test = anyTest as TestInterface<TestContext>;

test.beforeEach((t) => {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  traceResolvers(schema);
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
