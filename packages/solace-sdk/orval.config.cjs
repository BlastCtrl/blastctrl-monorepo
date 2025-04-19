/** @type {import('orval').Config} */
module.exports = {
  'solace-sdk': {
    input: './openapi.yaml',
    output: {
      target: './src/generated/solace-sdk.ts',
      client: 'fetch',
      mode: 'split',
      override: {
        mutator: {
          path: './src/custom-fetch.ts',
          name: 'customFetch',
        },
      }
    }
  },
};
