import { makeExecutableSchema } from 'graphql-tools';
import { v4 as uuid } from 'uuid';

const blocked = new Map();

function hello () {
  return 'world';
}

function throwsSynchronously () {
  throw new Error('Some error');
}

function createBlocking () {
  const id = uuid();

  let resolvePromise;
  let rejectPromise;
  const promise = new Promise(function (resolve, reject) {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  blocked.set(id, {
    resolve: resolvePromise,
    reject: rejectPromise,
    promise
  });
  return id;
}

type Args = { id: string };

function waitFor (obj: any, args: Args) {
  const { promise } = blocked.get(args.id);
  return promise;
}

function resolve (obj: any, args: Args) {
  const { resolve } = blocked.get(args.id);
  resolve();
}

function reject (obj: any, args: Args) {
  const id = args.id;
  const { reject } = blocked.get(id);
  reject(new Error(`Blocking work ${id} failed`));
}

async function parent () {
  return {};
}

async function parentName () {
  return 'Parent name';
}

const resolvers = {
  Parent: {
    name: parentName
  },
  Query: {
    hello,
    throwsSynchronously,
    waitFor,
    parent
  },
  Mutation: {
    createBlocking,
    resolve,
    reject
  }
};

const typeDefs = `
type Parent {
  name: String!
}

type Query {
  hello: String!
  throwsSynchronously: String!
  waitFor(id: String!): Boolean
  parent: Parent!
}

type Mutation {
  createBlocking: String!
  resolve(id: String!): Boolean
  reject(id: String!): Boolean
}
`;

export default makeExecutableSchema({ typeDefs, resolvers });
