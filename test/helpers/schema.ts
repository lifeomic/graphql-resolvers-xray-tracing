import { makeExecutableSchema } from 'graphql-tools';
import { v4 as uuid } from 'uuid';
import { loadFiles } from '@graphql-toolkit/file-loading';
import path from 'path';
import traceResolvers from '../../src/traceResolvers';

const blocked = new Map();

function hello () {
  return 'world';
}

function throwsSynchronously () {
  throw new Error('Some error');
}

function throwsAsynchronously () {
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
    throwsAsynchronously,
    waitFor,
    parent
  },
  Mutation: {
    createBlocking,
    resolve,
    reject
  }
};

export function traceSchema () {
  const schema = makeExecutableSchema({
    typeDefs: loadFiles(path.join(__dirname, '**/*.graphql')),
    resolvers
  });
  return traceResolvers(schema);
}
