declare module "better-sqlite3" {
  type RunResult = unknown;

  export default class Database {
    constructor(filename: string, options?: unknown);
    pragma(statement: string): void;
    exec(statement: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
  }

  interface Statement<T = unknown> {
    get(...params: unknown[]): any;
    all(...params: unknown[]): any[];
    run(...params: unknown[]): RunResult;
  }
}
