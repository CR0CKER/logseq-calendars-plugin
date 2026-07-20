// Pin the timezone so date-reconstruction tests are deterministic across machines
// (the non-tzid recurrence path reads local wall-clock time).
process.env.TZ = "UTC";

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // The project tsconfig targets ESM (for Parcel); Jest runs CommonJS, so tell
  // ts-jest to emit CJS for tests. index.ts has module-level Logseq side effects
  // and is intentionally not imported here — tests exercise ./parsing only.
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: { module: "commonjs", esModuleInterop: true } }],
  },
  testMatch: ["**/*.test.ts"],
};
