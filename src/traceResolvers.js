const { applyMiddlewareToDeclaredResolvers } = require('graphql-middleware');
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
  if (process.env.DISABLE_XRAY_LOGGING) {
    return resolver();
  }
  let result;
  const fieldPath = fieldPathFromInfo(info);
  AWSXRay.captureAsyncFunc(`GraphQL ${fieldPath}`, function (subsegment) {
    result = resolver();
    // Note 1: When AWS_XRAY_CONTEXT_MISSING is set to LOG_MISSING and no context was
    // found, then the subsegment will be null and nothing should be done
    // Note 2: We don't trace requests during integration tests since it makes logs unreadable
    if (subsegment) {
      if (isPromise(result)) {
        result.then(function () {
          subsegment.close();
        }).catch(function (error) {
          subsegment.close(error);
        });
      } else {
        subsegment.close();
      }
    }
  });

  return result;
};

module.exports = function (schema) {
  applyMiddlewareToDeclaredResolvers(schema, tracer);
};
