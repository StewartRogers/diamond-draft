declare module "better-sqlite3" {
  type RunResult = unknown;

  export default class Database {
    constructor(filename: string, options?: unknown);
    pragma(statement: string): void;
    exec(statement: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  }

  interface Statement<T = unknown> {
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
    run(...params: unknown[]): RunResult;
  }
}
