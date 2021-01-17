import { applyMiddlewareToDeclaredResolvers } from 'graphql-middleware';
import AWSXRay from 'aws-xray-sdk-core';
import { GraphQLResolveInfo, GraphQLSchema, ResponsePath } from 'graphql';
import { GraphQLSchemaWithFragmentReplacements, IMiddlewareResolver } from 'graphql-middleware/dist/types';

function fieldPathFromInfo (info: GraphQLResolveInfo) {
  let path: ResponsePath | undefined = info.path;
  const segments: Array<number | string> = [];
  while (path) {
    segments.unshift(path.key);
    path = path.prev;
  }

  return segments.join('.');
}

export default <TSource = any, TContext = any, TArgs = any>(schema: GraphQLSchema): GraphQLSchemaWithFragmentReplacements => {
  const tracer: IMiddlewareResolver<TSource, TContext, TArgs> = async (resolver, _parent, _args, _ctx, info) => {
    const fieldPath = fieldPathFromInfo(info);
    return AWSXRay.captureAsyncFunc(`GraphQL ${fieldPath}`, async (subsegment) => {
      // When AWS_XRAY_CONTEXT_MISSING is set to LOG_MISSING and no context is found then subsegment is undefined.
      try {
        const result = await resolver();
        subsegment?.close();
        return result;
      } catch (error: any) {
        subsegment?.close(error);
        throw error;
      }
    });
  };

  return applyMiddlewareToDeclaredResolvers(schema, tracer);
};
