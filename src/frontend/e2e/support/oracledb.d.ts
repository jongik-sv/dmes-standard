/**
 * oracledb 7.0.1 은 타입 정의를 싣지 않고 @types/oracledb 도 쓰지 않아 tsc 가 TS7016 을 낸다. e2e/support/oracle.ts 가 쓰는 API 만 최소로 선언한다.
 * 쓰는 API 가 늘면 여기에 더한다(런타임에는 영향 없다).
 */
declare module "oracledb" {
  export type BindParameters = Record<string, unknown> | unknown[];

  export interface ExecuteOptions {
    autoCommit?: boolean;
    outFormat?: number;
  }

  export interface Result<R> {
    rows?: R[] | unknown[][];
    rowsAffected?: number;
  }

  export interface Connection {
    execute<R = unknown>(sql: string, binds?: BindParameters, options?: ExecuteOptions): Promise<Result<R>>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    close(): Promise<void>;
  }

  export interface ConnectionAttributes {
    user?: string;
    password?: string;
    connectString?: string;
  }

  export const OUT_FORMAT_ARRAY: number;
  export const OUT_FORMAT_OBJECT: number;
  export function getConnection(attributes: ConnectionAttributes): Promise<Connection>;

  const oracledb: {
    OUT_FORMAT_ARRAY: number;
    OUT_FORMAT_OBJECT: number;
    getConnection: typeof getConnection;
  };
  export default oracledb;
}
