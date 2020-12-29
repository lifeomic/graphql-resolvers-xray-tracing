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
  let result;

  const fieldPath = fieldPathFromInfo(info);
  AWSXRay.captureAsyncFunc(`GraphQL ${fieldPath}`, function (subsegment) {
    result = resolver();

    // When AWS_XRAY_CONTEXT_MISSING is set to LOG_MISSING and no context was
    // found, then the subsegment will be null and nothing should be done
    if (subsegment) {
      if (isPromise(result)) {
        result.then(function () {
          subsegment.close();
        }).catch(function (error) {
          subsegment.close(serializeError(error));
        });
      } else {
        subsegment.close();
      }
    }
  });

  return result;
};

/* Constructs an xray-safe error object (no circular structure errors) */
export const serializeError = (e: string | Error) => {
  if (typeof e === 'string') {
    return e;
  }

  // See here for how error properties are parsed - https://github.com/aws/aws-xray-sdk-node/blob/master/packages/core/lib/segments/attributes/captured_exception.js#L12
  return {
    message: e.message,
    name: e.name,
    stack: e.stack,
  };
};


module.exports = function (schema) {
  applyMiddlewareToDeclaredResolvers(schema, tracer);
};
