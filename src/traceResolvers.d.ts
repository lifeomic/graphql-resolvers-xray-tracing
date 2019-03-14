declare module '@lifeomic/graphql-resolvers-xray-tracing' {
  import { GraphQLSchema } from 'graphql'
  function traceResolvers (schema: GraphQLSchema): void
  export = traceResolvers
}