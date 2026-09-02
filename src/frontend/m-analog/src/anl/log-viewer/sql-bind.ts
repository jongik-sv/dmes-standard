/**
 * 로그 분석 (anl/logViewer) — SQL Binder.
 * 원본: analog-express-ui-plate src/util/sql.js 이식 (파싱 로직 동일).
 *
 * MyBatis 로그 텍스트에서 "SQL :" 구문과 동일 스레드의 "Parameters: " 줄을 찾아
 * `?` 플레이스홀더를 타입별 리터럴로 치환한 SQL 을 만든다.
 *  - (Timestamp) → TO_TIMESTAMP('값', 'YYYY-MM-DD HH24:MI:SS.FF1')
 *  - (Date)      → TO_DATE('값', 'YYYY-MM-DD HH24:MI:SS')
 *  - null        → null
 *  - 그 외        → '값'
 *
 * 원본 대비 의도적 변경: `?` 수와 파라미터 수 불일치 시 원본은 경고(alert, 연산자 우선순위
 * 버그로 메시지 깨짐) 후 부분 치환을 계속했으나, 여기서는 명확한 한국어 메시지의 Error 를
 * 던지고 중단한다. 호출부(Binder 툴바)가 메시지로 표시한다.
 */

export function bindSql(editorString: string): string {
  // 스레드 번호 추출 — "2026-01-02 03:04:05,678 {thread} ... DEBUG  ==> SQL :" 패턴.
  const threadCheck = editorString.match(
    /20\d\d-\d\d-\d\d \d\d:\d\d:\d\d,\d\d\d ([\w\d-]+).* DEBUG {2}==> SQL :/,
  );
  let threadNo = "";
  if (threadCheck && threadCheck.length > 0) {
    threadNo = threadCheck[1];
  }

  // "SQL :" 앞부분 제거 (s 플래그 — 개행 포함 탐욕 매칭으로 마지막 "SQL :" 이후만 남김).
  const body = editorString.replace(/.*SQL :/s, "");

  const sqlStmtArray: string[] = [];
  const lineArray = body.split("\n");

  sqlStmtArray.push(lineArray[0] ?? "");
  lineArray.shift();

  // 다음 타임스탬프 줄이 나오기 전까지를 SQL 본문으로 수집.
  while (lineArray.length > 0) {
    if (
      /^20\d\d-[01]\d-[012]\d [012]\d:[012345]\d:[012345]\d/.test(lineArray[0])
    ) {
      break;
    }
    sqlStmtArray.push(lineArray[0]);
    lineArray.shift();
  }

  let sql = sqlStmtArray.join("\n");

  // 동일 스레드의 Parameters: 줄 파싱.
  const paramArr: string[] = [];
  for (let i = 0; i < lineArray.length; i++) {
    if (lineArray[i].match(`,[0-9][0-9][0-9] ${threadNo}.* Parameters: `)) {
      paramArr.push(...lineArray[i].split(" Parameters: ")[1].split(", "));
      break;
    }
  }

  const paramCnt = sql.split("?").length - 1;

  if (paramCnt > 0) {
    if (paramCnt !== paramArr.length) {
      throw new Error(
        paramCnt > paramArr.length
          ? `'?' 개수(${paramCnt})가 파라미터 개수(${paramArr.length})보다 많습니다. 선택한 로그 범위를 확인하세요.`
          : `파라미터 개수(${paramArr.length})가 '?' 개수(${paramCnt})보다 많습니다. 선택한 로그 범위를 확인하세요.`,
      );
    }

    paramArr.forEach((v) => {
      const value = v.replace(/\([^(]+\)\s*$/, "");
      if (v.match(/\(Timestamp\)\s*$/)) {
        // 예: 2023-01-03 12:23:00.0
        sql = sql.replace(
          "?",
          "TO_TIMESTAMP('" + value + "', 'YYYY-MM-DD HH24:MI:SS.FF1')",
        );
      } else if (v.match(/\(Date\)\s*$/)) {
        sql = sql.replace(
          "?",
          "TO_DATE('" + value + "', 'YYYY-MM-DD HH24:MI:SS')",
        );
      } else if (v.match(/^\s*null\s*$/)) {
        sql = sql.replace("?", "null");
      } else {
        sql = sql.replace("?", "'" + value + "'");
      }
    });
  }

  return sql;
}
