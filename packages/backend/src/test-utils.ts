import assert from 'node:assert/strict';

/** Small matcher helpers for the Node.js built-in test runner. */
export function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.equal(actual, expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeDefined() {
      assert.notEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toBeNull() {
      assert.equal(actual, null);
    },
    toContain(expected: any) {
      assert.ok(actual.includes(expected));
    },
    toMatch(expected: RegExp) {
      assert.match(actual, expected);
    },
    toHaveLength(expected: number) {
      assert.equal(actual.length, expected);
    },
    toBeGreaterThan(expected: number) {
      assert.ok(actual > expected, `Expected ${actual} to be > ${expected}`);
    },
    toBeGreaterThanOrEqual(expected: number) {
      assert.ok(actual >= expected, `Expected ${actual} to be >= ${expected}`);
    },
    toBeLessThan(expected: number) {
      assert.ok(actual < expected, `Expected ${actual} to be < ${expected}`);
    },
    toBeCloseTo(expected: number, precision = 2) {
      const tolerance = 0.5 * 10 ** -precision;
      assert.ok(
        Math.abs(actual - expected) < tolerance,
        `Expected ${actual} to be within ${tolerance} of ${expected}`,
      );
    },
    not: {
      toBe(expected: any) {
        assert.notEqual(actual, expected);
      },
    },
  };
}
