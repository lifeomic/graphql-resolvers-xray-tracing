import { applyMiddlewareToDeclaredResolvers } from 'graphql-middleware';
import AWSXRay from 'aws-xray-sdk-core';
import { GraphQLResolveInfo, GraphQLSchema, ResponsePath } from 'graphql';
import { GraphQLSchemaWithFragmentReplacements, IMiddlewareResolver } from 'graphql-middleware/dist/types';
const isPromise = require('is-promise');

function fieldPathFromInfo (info: GraphQLResolveInfo) {
  let path: ResponsePath | undefined = info.path;
  const segments = [];
  while (path) {
    segments.unshift(path.key);
    path = path.prev;
  }

  return segments.join('.');
}

export default <TSource = any, TContext = any, TArgs = any>(schema: GraphQLSchema): GraphQLSchemaWithFragmentReplacements => {
  const tracer: IMiddlewareResolver<TSource, TContext, TArgs> = async (resolver, parent, args, ctx, info) => {
    const fieldPath = fieldPathFromInfo(info);
    return AWSXRay.captureAsyncFunc(`GraphQL ${fieldPath}`, async (subsegment) => {
      const result = resolver();

      // When AWS_XRAY_CONTEXT_MISSING is set to LOG_MISSING and no context was
      // found, then the subsegment will be null and nothing should be done
      if (subsegment) {
        if (isPromise(result)) {
          result.then(() => subsegment.close(), (error: Error | any) => {
            subsegment.close(error);
          });
        } else {
          subsegment.close();
        }
      }
      return result;
    });
  };

  return applyMiddlewareToDeclaredResolvers(schema, tracer);
};
