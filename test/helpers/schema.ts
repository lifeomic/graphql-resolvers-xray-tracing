import { makeExecutableSchema } from '@graphql-tools/schema';
import { v4 as uuid } from 'uuid';
import { loadFiles } from '@graphql-toolkit/file-loading';
import path from 'path';
import traceResolvers from '../../src/traceResolvers';

const blocked = new Map();

const hello = () => {
  return 'world';
};

const throwsSynchronously = () => {
  throw new Error('Some error');
};

const throwsAsynchronously = () => {
  throw new Error('Some error');
};

const createBlocking = () => {
  const id = uuid();

  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  blocked.set(id, {
    resolve: resolvePromise,
    reject: rejectPromise,
    promise,
  });
  return id;
};

type Args = { id: string };

const waitFor = (obj: any, args: Args) => {
  const { promise } = blocked.get(args.id);
  return promise;
};

const resolve = (obj: any, args: Args) => {
  const { resolve } = blocked.get(args.id);
  resolve();
};

const reject = (obj: any, args: Args) => {
  const id = args.id;
  const { reject } = blocked.get(id);
  reject(new Error(`Blocking work ${id} failed`));
};

const parent = () => {
  return {};
};

const parentName = () => {
  return 'Parent name';
};

const resolvers = {
  Parent: {
    name: parentName,
  },
  Query: {
    hello,
    throwsSynchronously,
    throwsAsynchronously,
    waitFor,
    parent,
  },
  Mutation: {
    createBlocking,
    resolve,
    reject,
  },
};

export const traceSchema = () => {
  const schema = makeExecutableSchema({
    typeDefs: loadFiles(path.join(__dirname, '**/*.graphql')),
    resolvers,
  });
  return traceResolvers(schema);
};
