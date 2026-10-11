module.exports = {
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '\\.(css|png|jpg|jpeg|svg|gif)$': '<rootDir>/__mocks__/fileMock.js',
  },
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
};
