const { applyMiddleware } = require('graphql-middleware');
const AWSXRay = require('aws-xray-sdk-core');
const isPromise = require('is-promise');

function fieldPathFromInfo (info) {
  let path = info.path;
  const segments = [];
  while (path) {
    segments.unshift(path.key);
    path = path.prev;
  }

  return segments.join('.');
}

const tracer = function (resolver, parent, args, ctx, info) {
  let result;

  const fieldPath = fieldPathFromInfo(info);
  AWSXRay.captureAsyncFunc(`GraphQL ${fieldPath}`, function (subsegment) {
    result = resolver();

    if (isPromise(result)) {
      result.then(function () {
        subsegment.close();
      }).catch(function (error) {
        subsegment.close(error);
      });
    } else {
      subsegment.close();
    }
  });

  return result;
};

module.exports = function (schema) {
  applyMiddleware(schema, tracer);
};
