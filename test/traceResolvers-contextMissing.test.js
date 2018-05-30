process.env.AWS_XRAY_CONTEXT_MISSING = 'LOG_ERROR';

const traceResolvers = require('../src/traceResolvers');
const { graphql } = require('graphql');
const schema = require('./helpers/schema');
const nock = require('nock');
const test = require('ava');
const AWSXRay = require('aws-xray-sdk-core');
AWSXRay.capturePromise();

test.beforeEach(function (test) {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  traceResolvers(schema);
  test.context.graphql = function (query) {
    return graphql(schema, query);
  };
});

test.always.afterEach(function (test) {
  nock.enableNetConnect();
  nock.cleanAll();
});

test('Traced resolvers can return a value', async function (test) {
  const {graphql} = test.context;
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
