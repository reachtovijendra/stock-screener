import assert from 'node:assert/strict';
import {
  extractBearerToken,
  normalizeShareRole,
  readQueryParam,
  resolveUserByEmail,
} from './watchlist-sharing';

assert.equal(extractBearerToken('Bearer abc.def'), 'abc.def');
assert.equal(extractBearerToken('bearer token-value'), 'token-value');
assert.equal(extractBearerToken('Basic token-value'), null);
assert.equal(extractBearerToken(undefined), null);

assert.equal(normalizeShareRole('viewer'), 'viewer');
assert.equal(normalizeShareRole('editor'), 'editor');
assert.equal(normalizeShareRole('owner'), null);

assert.equal(readQueryParam(['first', 'second']), 'first');
assert.equal(readQueryParam('single'), 'single');
assert.equal(readQueryParam(undefined), null);

const fakeClient = {
  auth: {
    admin: {
      async listUsers({ page }: { page?: number }) {
        return {
          data: {
            users: page === 1
              ? [{ id: 'u1', email: 'owner@example.com' }, { id: 'u2', email: 'Shared@Example.com' }]
              : [],
          },
          error: null,
        };
      },
    },
  },
};

async function run() {
  const resolvedUser = await resolveUserByEmail(fakeClient as any, 'shared@example.com');
  assert.deepEqual(resolvedUser, { id: 'u2', email: 'Shared@Example.com' });

  const missingUser = await resolveUserByEmail(fakeClient as any, 'missing@example.com');
  assert.equal(missingUser, null);

  console.log('watchlist-sharing API helper tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
