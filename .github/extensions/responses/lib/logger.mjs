const LEVELS = { silent: 0, error: 1, info: 2, debug: 3 };
const VALID_LEVELS = new Set(Object.keys(LEVELS));

const noop = () => {};

export function createLogger(logLevel = "info") {
  const level = VALID_LEVELS.has(logLevel) ? logLevel : "info";
  const threshold = LEVELS[level];

  return {
    error: threshold >= LEVELS.error ? (...args) => console.error("responses:", ...args) : noop,
    info:  threshold >= LEVELS.info  ? (...args) => console.error("responses:", ...args) : noop,
    debug: threshold >= LEVELS.debug ? (...args) => console.error("responses:", ...args) : noop,
    level,
  };
}
