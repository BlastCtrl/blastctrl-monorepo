/** @type {import('orval').Config} */
module.exports = {
  'solace-sdk': {
    input: './openapi.yaml',
    output: {
      target: './src/generated/solace-sdk.ts',
      client: 'fetch',
      mode: 'split',
      // The app proxies this prefix to the backend (apps/tools/next.config.js).
      baseUrl: '/blast-api',
      override: {
        mutator: {
          path: './src/custom-fetch.ts',
          name: 'customFetch',
        },
        fetch: {
          // Functions resolve to the success body; the mutator throws otherwise.
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
};
