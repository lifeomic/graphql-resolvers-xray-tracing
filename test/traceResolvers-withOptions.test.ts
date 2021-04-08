import { graphql } from 'graphql';
import { traceSchema } from './helpers/schema';
import { TraceOptions } from '../src/traceResolvers';
import nock from 'nock';
import anyTest, { TestInterface } from 'ava';
import AWSXRay, { Segment } from 'aws-xray-sdk-core';
import { ExecutionResult, ExecutionResultDataDefault } from 'graphql/execution/execute';

AWSXRay.capturePromise();

type GraphQlQuery = Parameters<typeof graphql>[1];
type Namespace = ReturnType<typeof AWSXRay.getNamespace>;

interface TestContext {
  ns: Namespace;
  segment: Segment;
  graphql: <TData = ExecutionResultDataDefault>(query: GraphQlQuery) => Promise<ExecutionResult<TData>>;
}

const test = anyTest as TestInterface<TestContext>;
const traceOptions: TraceOptions = {
  enabled: true
};

test.beforeEach(function (test) {
  const schema = traceSchema(traceOptions);
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  const ns: Namespace = AWSXRay.getNamespace();
  test.context.ns = ns;

  const segment = new AWSXRay.Segment('parent');
  test.context.segment = segment;

  test.context.graphql = ns.bind(function (query: GraphQlQuery) {
    AWSXRay.setSegment(segment);
    try {
      return graphql(schema, query);
    } finally {
      segment.close();
    }
  });
});

test.afterEach.always(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

test('Trace segments are not created for resolvers when enabled is not true', async function (test) {
  try {
    traceOptions.enabled = false;
    const { segment, graphql } = test.context;
    const result = await graphql('{ hello }');

    if (result.errors) {
      throw result.errors[0];
    }
    test.deepEqual(result, {
      data: {
        hello: 'world'
      }
    });

    test.is(segment.subsegments, undefined);
  } finally {
    traceOptions.enabled = true;
  }
});

const pre = (test: any, options: TraceOptions|null) => {
  const schema = traceSchema(options);
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  const ns: Namespace = AWSXRay.getNamespace();
  test.context.ns = ns;

  const segment = new AWSXRay.Segment('parent');
  test.context.segment = segment;

  test.context.graphql = ns.bind(function (query: GraphQlQuery) {
    AWSXRay.setSegment(segment);
    try {
      return graphql(schema, query);
    } finally {
      segment.close();
    }
  });
};

test('Trace segments are created for resolvers when defaults are used', async function (test) {
  try {
    pre(test, null);

    const { segment, graphql } = test.context;
    const result = await graphql('{ hello }');

    if (result.errors) {
      throw result.errors[0];
    }
    test.deepEqual(result, {
      data: {
        hello: 'world'
      }
    });

    test.is(segment.subsegments?.length, 1);
  } finally {
    nock.enableNetConnect();
    nock.cleanAll();
  }
});
