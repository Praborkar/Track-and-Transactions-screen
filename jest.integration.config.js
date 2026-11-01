// Plain Node environment: the real engine talks to the real mock server over real HTTP.
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/integration/**/*.test.ts'],
  transform: { '^.+\.[jt]sx?$': ['babel-jest', { presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'] }] },
};
