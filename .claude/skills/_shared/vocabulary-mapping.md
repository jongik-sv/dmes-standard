# 어휘 매핑표 — 부산 템플릿 어휘 → 레거시 원천(앱·DB 방언)

mes-plugin 의 산출물 템플릿(BPA / 레거시 / 프로세스그룹 / 프로시저 분석) 은 부산 프로젝트(GLUE Framework + Java + Oracle PL/SQL) 시절 헤딩으로 굳어졌다. **템플릿 헤딩과 JSON 스키마 키 이름은 그대로 두고**, 본문을 채울 때 본 표로 의미를 분석 대상 레거시 맥락으로 매핑한다. 앱 계층은 SampleErp(C# WinForms) 기준 §1·§2 를, DB 계층은 **원천 DBMS 를 먼저 판정(§3-1)한 뒤** 그 방언 열(§3-3)을 따른다. 원천 DBMS 는 고객사마다 다르다 — Oracle PL/SQL · PostgreSQL PL/pgSQL · MSSQL T-SQL 순으로 지원하고, SQLite 원천(저장 프로시저 없음)은 §3-4 로 다룬다.

본 파일은 generate-* / analyze-* / define-process-groups 스킬이 공통으로 참조한다.

## 1. 화면/클래스 단위

| 영역 | 부산 (Java/GLUE) | SampleErp (C# WinForms) |
|---|---|---|
| 분석 단위 | Service XML 1개 (`./src/service/{ID}-service.xml`) | 화면 폴더 1개 (`docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/{도메인}/.../{화면코드}*/`) |
| 식별자 | SERVICE-ID (예 `M473020030`, `B47R1001`) | SCREEN-ID (예 `SOA004K`, `CEA035K`) |
| 모듈 분류 | `serviceType` ui(M*) / nui(B*) | `moduleId` = 화면코드 prefix 3글자 (`SOA`, `QMA`, `HCA`, `CEA`, `RPD` …) |
| 화면 단위 클래스 | Java Activity (`extends ...Activity`) | C# partial class (`{Name}.cs` + `{Name}.Designer.cs`) |
| 진입점 메서드 | `doMainActivity(PosContext ctx)` | 이벤트 핸들러 (`OnSearch`, `OnSave`, `OnClear`, `cmd_Click`, `xxx_Click`) |
| 생명주기 메서드 | `doPreActivity` / `doMainActivity` / `doPostActivity` | `Form_Load` / 핸들러 메서드 / `Form_Closing` |
| 베이스 클래스 | `M{XX}CommonActivity`, `DhtmlxActivity`, `M{XX}QueryConstants` | `FormWith1Grid`, `DialogWith1Grid` (Foundation/), `Form` (System.Windows.Forms) |
| Context 객체 | `PosContext`, `PosRow`, `PosRowSet` | `DataSet`, `DataTable`, `DataRow`, `FpSpread.SheetView`, `MainQuery` |
| 컨텍스트 접근 | `getFirstPosRow(ctx, "rowKey")` / `getFirstPosRowValue(ctx, "rk", "col")` | `dataSet.Tables["X"].Rows[i]["col"]`, `fpSpread.ActiveSheet.Cells[r, c].Value` |
| DAO / SQL 호출 | `PosGenericDao.getProperty(SQLKEY)`, `dao.find(...)` | `AppDB.Execute("doXxx", params)`, `MainQuery.Get(...)`, `new SqlCommand(...)` (inline) |
| 예외 | `PosException`, `throw new PosException(msg, code)` | `try/catch (Exception)`, `MessageBoxEx.Show(msg)`, `throw new ApplicationException(msg)` |
| 정밀계산 | `BigDecimal.multiply().divide().add()` | `decimal` (`*` `/` `+`), `Math.Round` |
| 상수 정의 | `M{XX}ConstantsIF.SELECT_SQL`, `RK_*` | `const string`, `MainQueryConstants` (있으면), `Resources.resx` 텍스트 키 |
| 상속/구현 키워드 | `extends`, `implements` | `:` (단일 상속 + 인터페이스 콤마 나열) |
| 임포트 | `import com.poscoict....` | `using System.Windows.Forms;`, `using FarPoint.Win.Spread;` |
| 메서드 가시성 | `public/protected/private` | 동일 |
| 반환값 (Activity) | `"SUCCESS"` / `"END"` / `"FAILURE"` 문자열 | `void` (이벤트 핸들러), `bool` (검증 메서드), `DialogResult` (Dialog) |

## 2. UI 컴포넌트

| 영역 | 부산 (JSP / GLUE Form/Grid XML) | SampleErp (WinForms) |
|---|---|---|
| 화면 정의 위치 | `./WebContents/{SERVICE-ID}.jsp` + `./WebContents/header/kr/{SERVICE-ID}/*.xml` | `{화면코드}.Designer.cs` (`InitializeComponent()`) + `{화면코드}.resx` |
| 레이아웃 | `var initLayout = { dirType: "row", components: [...] }` (JSP JS) | `Dock` / `Anchor` / `SplitContainer` / `TableLayoutPanel` (Designer.cs 안의 속성 설정) |
| 폼 컴포넌트 | `<form id="formSearch">` XML | `Form` 위에 배치된 컨트롤들 (`TextBox`, `ComboBox`, `DateTimePicker`, `Button`, `CheckBox`) |
| 입력 필드 (텍스트) | `<field type="text">` | `TextBox`, `C1TextBox` (ComponentOne) |
| 입력 필드 (콤보) | `<field type="combo">` | `ComboBox`, `C1Combo` |
| 입력 필드 (날짜) | `<field type="calendar">` | `DateTimePicker`, `C1DateEdit` |
| 그리드 | `<grid id="gridResult">` XML, columns 정의 | `FpSpread` (FarPoint), `DataGridView`, `C1FlexGrid` — `SheetView.Columns[i].Label/CellType/Width` |
| 라벨 | `<label>` | `Label`, `SmartLabel` |
| 버튼 | `<button id="btnSearch" event="onSearch">` | `Button` + `Click += new EventHandler(handlerName)` |
| 탭 | `<tabbar>` XML | `TabControl`, `C1TabControl` |
| 메뉴 | `<menu>` XML | `MenuStrip`, `ToolStripMenuItem` |
| 메시지 박스 | `<messagebox>` 컴포넌트 | `MessageBox.Show(...)`, `MessageBoxEx.Show(...)` |
| 이벤트 | `event="onSearch"` (JS 핸들러) | `이벤트핸들러 += new System.EventHandler(this.핸들러명);` (Designer.cs) |
| 클라이언트 스크립트 | JSP + JavaScript | C# 메서드 (이벤트 핸들러). **레거시 §"JavaScript 모듈" 섹션은 "해당 없음 (WinForms 데스크톱 — JS 미사용)" 으로 표기하고, 클라이언트 이벤트 핸들러 메서드 표로 대체** |

### Designer.cs 파싱 패턴 (참고)

```csharp
// 컴포넌트 선언
this.txtCoilId = new System.Windows.Forms.TextBox();
// 속성 설정
this.txtCoilId.Location = new System.Drawing.Point(10, 20);
this.txtCoilId.Size = new System.Drawing.Size(120, 21);
this.txtCoilId.TabIndex = 1;
// 이벤트 바인딩
this.btnSearch.Click += new System.EventHandler(this.btnSearch_Click);
// 부모-자식 (컨테이너 추가)
this.panelTop.Controls.Add(this.btnSearch);
```

정규식 추출 키:
- `this\.(\w+)\s*=\s*new\s+([\w\.]+)\(\);` → 컴포넌트 ID + 타입
- `this\.(\w+)\.(\w+)\s*=\s*(.+?);` → 속성 설정
- `this\.(\w+)\.(\w+)\s*\+=\s*new\s+[\w\.]+\(this\.(\w+)\);` → 이벤트 → 핸들러 매핑
- `this\.(\w+)\.Controls\.Add\(this\.(\w+)\);` → 부모-자식

### 외부 컴포넌트 라이브러리 의미 매핑

| 컴포넌트 라이브러리 | 컴포넌트 | 의미 |
|---|---|---|
| WinForms 표준 | `TextBox` | 입력 필드 |
| WinForms 표준 | `ComboBox` | 콤보 박스 |
| WinForms 표준 | `DateTimePicker` | 날짜 선택 |
| WinForms 표준 | `Button` | 버튼 |
| WinForms 표준 | `CheckBox` / `RadioButton` | 체크박스 / 라디오 |
| WinForms 표준 | `DataGridView` | 그리드 (표준) |
| ComponentOne | `C1Combo` | 콤보 박스 (확장) |
| ComponentOne | `C1TextBox` | 입력 필드 (확장) |
| ComponentOne | `C1DateEdit` | 날짜 선택 (확장) |
| ComponentOne | `C1TabControl` | 탭 |
| FarPoint Spread | `FpSpread` | 그리드 (메인) |
| 사내 라이브러리 | `SmartLabel` | 라벨 (다국어) |
| 사내 라이브러리 | `MessageBoxEx` | 메시지 박스 (확장) |

## 3. SQL / 데이터베이스 (원천 DBMS 방언)

### 3-1. 원천 DBMS 판정 (모든 analyze-* 의 첫 단계)

DB 객체를 분석하기 전에 원천 DBMS 를 하나로 정한다. 아래 순서로 판정하고, 앞 단계에서 정해지면 뒤 단계는 건너뛴다.

1. **README 표기** — `docs/external/{시스템명}/README.md` 에서 값이 하나뿐인 `원천 DBMS: X` 줄을 읽는다. 형식 안내 문구(`{Oracle|PostgreSQL|MSSQL|SQLite}` 처럼 중괄호·`|` 가 든 줄)는 미기재로 본다.
2. **원천 SQL 문법 단서** — README 에 없으면 분석 대상 `.sql` 본문(없으면 `tables/` 의 DDL 몇 개)에서 단서를 찾는다.

   | 판정 | 단서 |
   |---|---|
   | Oracle | `CREATE OR REPLACE PACKAGE [BODY]`, `VARCHAR2`, `NUMBER(`, `IS`/`AS` 뒤 `BEGIN ... END 이름;`, `:NEW`/`:OLD`, `NVL(`, `SYSDATE`, `/` 단독 줄 |
   | PostgreSQL | `LANGUAGE plpgsql`, `$$` 본문 구분자, `RETURNS TRIGGER`/`RETURNS SETOF`, `::타입` 캐스트, `SERIAL`, `EXECUTE FUNCTION` |
   | MSSQL | `GO` 단독 줄, `NVARCHAR`, `@변수`, `dbo.`·`[dbo].[...]`, `BEGIN TRY`, `@@ROWCOUNT` |
   | SQLite | `procedures/`·`functions/` 가 비어 있고 `AUTOINCREMENT`, `INTEGER PRIMARY KEY`, `PRAGMA`, `sqlite_master` |

   단서가 두 방언에 걸치면(예: `COALESCE` 처럼 공통 문법만 있음) 판정 불가로 본다.
3. **사용자 확인** — 판정 불가면 AskUserQuestion 으로 원천 DBMS 를 묻는다. 추측으로 진행하지 않는다.

판정 결과는 **각 분석 보고서 §1 첫 줄(또는 메타데이터 표의 첫 행)에 `원천 DBMS: X`** 로 적고(판정 근거 — README / 문법 단서 / 사용자 확인 — 를 괄호로 덧붙임), 하위 서브에이전트에 위임할 때 프롬프트에 그대로 넘긴다.

### 3-2. 공통 (방언 무관)

| 영역 | 내용 |
|---|---|
| SQL 본문 위치 | 정적 파일 (`docs/external/{시스템명}/{procedures\|functions\|tables\|views\|triggers}/{이름}.sql`). DB 직접 접속은 하지 않는다 |
| 의존성 조회 | 시스템 카탈로그 접근 불가 → 본문 정규식(§3-3 "호출 구문" 행)이 유일한 방법 |
| 기본 스키마 표기 | Oracle = 소유 스키마(파일에 없으면 생략), PostgreSQL = `public`, MSSQL = `dbo`. 보고서의 `{schema}.{객체}` 표기는 이 값을 쓴다 |
| 식별자 인용 | Oracle `"X"`(인용 없으면 대문자), PostgreSQL `"x"`(인용 없으면 소문자), MSSQL `[X]`. 정규식은 세 형태와 무인용을 모두 허용한다 |

### 3-3. 방언 매핑표

| 영역 | Oracle PL/SQL | PostgreSQL PL/pgSQL | MSSQL T-SQL |
|---|---|---|---|
| 분석 단위 | `PACKAGE`(SPEC + BODY) 단위로 묶어 분석. 독립 `PROCEDURE` / `FUNCTION` 은 단일 객체 | 단일 `FUNCTION` / `PROCEDURE`(11+). 패키지 없음 — schema 로 묶여 있으면 §1 에 schema 를 그룹으로 표기 | 단일 `PROCEDURE` / `FUNCTION`. 패키지 없음 |
| 보고서 §1 단위 표기 | "PACKAGE {PKG} (멤버 N개)" 또는 "단일 PROCEDURE/FUNCTION" | "패키지 없음, 단일 FUNCTION/PROCEDURE" | "패키지 없음, 단일 PROCEDURE/FUNCTION" |
| 객체 헤더 | `CREATE OR REPLACE PACKAGE [BODY] p IS\|AS`, `CREATE OR REPLACE PROCEDURE p (a IN VARCHAR2, b OUT NUMBER) IS` | `CREATE OR REPLACE FUNCTION f(a text, OUT b int) RETURNS ... LANGUAGE plpgsql AS $$ ... $$` | `CREATE [OR ALTER] PROCEDURE [dbo].[p] @a INT, @b INT OUTPUT AS BEGIN ... END` |
| 파라미터 모드 | `IN` / `OUT` / `IN OUT` | `IN` / `OUT` / `INOUT` / `VARIADIC` | 입력 / `OUTPUT` |
| 변수 선언·식별 | `IS`/`DECLARE` 절의 `v_x NUMBER;` — 접두 기호 없음(관례 `p_`·`v_`·`l_`) | `DECLARE` 절의 `v_x int;` — 접두 기호 없음 | `DECLARE @v INT` — `@` 접두 |
| 바인드 변수 | `:name` (앱 SQL), 본문은 파라미터명 직접 | `$1`·`$2` (prepared / 동적 SQL), 본문은 이름 있는 인자 | `@name` |
| 호출 구문 | `PKG.PROC(...)`, `SCHEMA.PKG.PROC(...)`, 블록 안 `PROC(...);` 단독 문장, `CALL p(...)`, 동적 `EXECUTE IMMEDIATE '...' USING ...`, `DBMS_SQL` | `CALL p(...)`, `PERFORM f(...)`, `SELECT f(...)`, `x := f(...)`, `SELECT * FROM f(...)`, 동적 `EXECUTE format('...', ...) USING ...` | `EXEC`/`EXECUTE [dbo.]p @a, @b`, `dbo.f(...)`, `SELECT * FROM dbo.tvf(...)`, 동적 `EXEC(@sql)`·`sp_executesql` |
| 커서 | `CURSOR c IS SELECT ...; OPEN c; FETCH c INTO ...; EXIT WHEN c%NOTFOUND; CLOSE c;` 또는 `FOR rec IN (SELECT ...) LOOP ... END LOOP;` | `FOR rec IN SELECT ... LOOP ... END LOOP;`, `DECLARE c CURSOR FOR ...; OPEN c; FETCH c INTO ...; EXIT WHEN NOT FOUND;`, `refcursor` | `DECLARE c CURSOR FOR SELECT ...; OPEN c; FETCH NEXT FROM c INTO @v1; WHILE @@FETCH_STATUS=0 BEGIN ... END; CLOSE c; DEALLOCATE c;` |
| 트랜잭션 | `SAVEPOINT sp1`, `ROLLBACK TO sp1`, `COMMIT`, `ROLLBACK` (암묵 시작), `PRAGMA AUTONOMOUS_TRANSACTION` | FUNCTION 안에서는 `COMMIT` 불가. PROCEDURE(11+)는 `COMMIT`/`ROLLBACK` 가능. `EXCEPTION` 블록이 암묵 SAVEPOINT 역할 | `BEGIN TRAN`, `SAVE TRANSACTION sp1`, `ROLLBACK TRANSACTION sp1`, `COMMIT TRANSACTION`, `@@TRANCOUNT`, `SET XACT_ABORT ON` |
| 에러 발생 | `RAISE_APPLICATION_ERROR(-20001, 'msg')`, `RAISE 예외명` | `RAISE EXCEPTION 'msg %', v USING ERRCODE = '...'` | `RAISERROR('msg', 16, 1)`, `THROW 50001, 'msg', 1` |
| 예외 처리 | `EXCEPTION WHEN NO_DATA_FOUND / OTHERS THEN ...`, `SQLCODE`·`SQLERRM` | `EXCEPTION WHEN unique_violation / OTHERS THEN ...`, `SQLSTATE`·`SQLERRM`, `GET STACKED DIAGNOSTICS` | `BEGIN TRY ... END TRY BEGIN CATCH ... END CATCH`, `ERROR_NUMBER()`·`ERROR_MESSAGE()` |
| 결과 반환 | `OUT` 파라미터, `SYS_REFCURSOR`, `RETURN 값` (FUNCTION), `PIPELINED` | `RETURNS SETOF`·`RETURNS TABLE(...)` + `RETURN QUERY`, `OUT`/`INOUT`, `refcursor` | 결과집합 `SELECT ...`, `OUTPUT` 파라미터, `RETURN 정수` |
| 트리거 정의 | `CREATE OR REPLACE TRIGGER t BEFORE\|AFTER\|INSTEAD OF ... ON tbl [FOR EACH ROW] BEGIN ... END;` (본문 내장) | `CREATE TRIGGER t BEFORE\|AFTER\|INSTEAD OF ... ON tbl FOR EACH ROW\|STATEMENT EXECUTE FUNCTION fn();` — **본문은 `RETURNS TRIGGER` 함수(`functions/{fn}.sql`)에 있다** | `CREATE TRIGGER t ON tbl AFTER\|FOR\|INSTEAD OF INSERT, UPDATE, DELETE AS ...` — 문장 단위만, 기본 AFTER |
| 트리거 행 참조 | `:NEW.col` / `:OLD.col` + `FOR EACH ROW`, 분기 `INSERTING`/`UPDATING`/`DELETING` | 트리거 함수의 `NEW.col` / `OLD.col`, 분기 `TG_OP`, 문장 단위는 `REFERENCING NEW TABLE AS ...` | 가상 테이블 `inserted` / `deleted` (여러 행), 분기는 두 테이블 행 존재 여부 |
| 시퀀스·자동 증가 | `seq.NEXTVAL`/`CURRVAL`, 12c+ `GENERATED ... AS IDENTITY`, 트리거 채번 | `nextval('seq')`, `SERIAL`/`BIGSERIAL`, `GENERATED ... AS IDENTITY` | `IDENTITY(1,1)`, `SCOPE_IDENTITY()`, `NEXT VALUE FOR seq` |
| NULL 대체 | `NVL(x, d)`, `NVL2`, `COALESCE`, `DECODE` | `COALESCE(x, d)`, `NULLIF` | `ISNULL(x, d)`, `COALESCE` |
| 문자열 연결 | `\|\|` | `\|\|`, `concat()` | `+`, `CONCAT` |
| 현재 시각 | `SYSDATE`, `SYSTIMESTAMP` | `now()`, `CURRENT_TIMESTAMP` | `GETDATE()`, `SYSDATETIME()` |
| 페이징 / TOP-N | `WHERE ROWNUM <= N`, 12c+ `OFFSET n ROWS FETCH NEXT m ROWS ONLY` | `LIMIT m OFFSET n` | `SELECT TOP N`, 2012+ `OFFSET n ROWS FETCH NEXT m ROWS ONLY` |
| 단일행 조회 | `SELECT 1 FROM DUAL` | `SELECT 1` | `SELECT 1` |
| 시스템 카탈로그 (본문 안 참조 시 시스템 테이블로 분류) | `ALL_*`/`USER_*`/`DBA_*` (`ALL_SOURCE`, `ALL_DEPENDENCIES`), `V$SESSION` | `pg_catalog.*` (`pg_proc`, `pg_depend`), `information_schema.*`, `pg_stat_activity` | `sys.*` (`sys.objects`, `sys.sql_modules`, `sys.dm_exec_connections`), `INFORMATION_SCHEMA.*` |
| 세션 정보 (트리거 감사용) | `SYS_CONTEXT('USERENV', ...)`, `USER` | `current_user`, `inet_client_addr()`, `pg_backend_pid()` | `@@SPID`, `HOST_NAME()`, `SUSER_SNAME()` |

### 3-4. SQLite 원천

SQLite 는 저장 프로시저·사용자 정의 함수가 DB 안에 없다(함수는 앱이 등록). 원천이 SQLite 면:

- `/analyze-plsql` 대상이 없다 — 보고서 §1 에 "원천 DBMS: SQLite — 저장 프로시저 없음" 으로 적고 종료한다. 업무 로직은 앱 코드 inline SQL(`/analyze-queries`)과 트리거·뷰에 있다.
- 트리거: `CREATE TRIGGER t BEFORE|AFTER|INSTEAD OF ... ON tbl [FOR EACH ROW] [WHEN ...] BEGIN ... END;` — 항상 행 단위, `NEW.col`/`OLD.col`, 오류는 `RAISE(ABORT, 'msg')`. `INSTEAD OF` 는 뷰에만.
- 그 밖: 바인드 `?`·`:name`·`@name`·`$name`, NULL 대체 `IFNULL`/`COALESCE`, 연결 `||`, 페이징 `LIMIT ... OFFSET`, 자동 증가 `INTEGER PRIMARY KEY [AUTOINCREMENT]`, 카탈로그 `sqlite_master`(`sqlite_schema`). 타입은 선언과 무관한 동적 타입(affinity)이라 DDL 타입을 제약으로 단정하지 않는다.

### 3-5. 앱 → DB 호출

| 영역 | 부산 (Java → Oracle) | SampleErp (C# WinForms) |
|---|---|---|
| Bind 호출 | `getProperty(SQLKEY)` + named parameter | `AppDB.Execute("procName", new { p1=val1, p2=val2 })` 또는 `{Provider}Command.Parameters.AddWithValue(...)` — 제공자 클래스는 원천 DBMS 따라 `OracleCommand` / `NpgsqlCommand` / `SqlCommand` / `SqliteCommand` |

### inline SQL 추출 패턴 (C# 코드 안)

```csharp
// 1) 프로시저 호출
AppDB.Execute("doInsertCoilList", new { CoilId = coilId, Wgt = wgt });
// 2) MainQuery 호출
DataTable dt = MainQuery.Get("S_CoilList", new { Yard = yard });
// 3) inline SqlCommand
var cmd = new SqlCommand("SELECT * FROM TB_COIL WHERE COIL_ID = @id", conn);
cmd.Parameters.AddWithValue("@id", coilId);
```

추출 정규식 (참고):
- `AppDB\.Execute\(\s*"(\w+)"` → 호출하는 procedure 이름
- `MainQuery\.Get\(\s*"(\w+)"` → query 이름 (있을 경우 별도 SQL 카탈로그)
- `new\s+SqlCommand\(\s*"([^"]+)"` → inline SQL 본문

## 4. 산출물 헤딩 시 어휘 적용

산출물 템플릿(헤딩) 은 변경하지 않고, 본문을 채울 때 다음 매핑을 따른다.

| 템플릿 헤딩 | 부산 본문 어휘 (지양) | 레거시 원천 본문 어휘 (적용) |
|---|---|---|
| BPA §6 "커스텀 클래스 워크플로우" | "Java Activity 200줄+" | "C# partial class 200줄+ — 핸들러/비즈니스 메서드 합산" |
| BPA §8 "화면 구성 개요 (UI만 해당)" | JSP 영역 + Form/Grid XML | Designer.cs 의 `InitializeComponent()` + `.resx` 리소스 |
| 레거시 §"⚙️ Java 컴포넌트 분석" | Java 클래스 헤딩 그대로 | C# partial class — 헤딩 그대로, 본문은 C# 어휘 |
| 레거시 §"JavaScript 모듈" | JSP+JS 함수 | "해당 없음 (WinForms — 클라이언트 JS 미사용)" + 클라이언트 이벤트 핸들러 메서드 표 |
| 레거시 §"이벤트 핸들러" | JSP `onclick=...` | C# Designer.cs 의 `Click += new EventHandler(...)` 매핑 |
| PL/SQL §"프로시저/함수 상세 분석" | (DB 직접 조회 기준) PACKAGE 멤버 / PROCEDURE / FUNCTION | 판정된 원천 DBMS 의 §3-3 "분석 단위" 행 — Oracle 이면 PACKAGE 멤버별, PostgreSQL·MSSQL 이면 단일 객체 (§1 에 단위 명시) |
| PL/SQL §"의존성 — 내부 호출 / 외부 의존성" | `ALL_DEPENDENCIES` 조회 | 본문 정규식 — §3-3 "호출 구문" 행의 판정 방언 패턴 (Oracle 은 같은 패키지 내 호출을 "내부 호출" 로 구분) |
| PL/SQL §"제어 흐름 — 트랜잭션 제어" | SAVEPOINT/ROLLBACK TO/COMMIT | §3-3 "트랜잭션" 행의 판정 방언 구문 |
| PL/SQL §"제어 흐름 — 커서 루프 상세 분석" | `FOR rec IN (...) LOOP` | §3-3 "커서" 행의 판정 방언 구문 |

## 5. JSON 스키마 키 이름 보존 정책

`structure.json` / `java_analysis.json` / `sql_analysis.json` / `ui_analysis.json` 파일명·키 이름 (예: `customActivities`, `javaSqlQueries`, `extractedPatterns`) 은 부산색이 묻어있더라도 **그대로 보존**한다. 산출물 템플릿이 이 키를 참조하므로 이름 변경은 템플릿/스킬 모두 갱신을 강제한다.

값에 들어가는 의미는 본 매핑표대로 SampleErp 맥락으로 채운다. 예시:
- `customActivities` 배열 → C# partial class 안에서 200줄 이상이거나 비즈니스 메서드를 다수 가진 핸들러/비즈니스 메서드 묶음
- `javaSqlQueries` 배열 → C# 코드 안에서 추출한 procedure 호출명 (`AppDB.Execute("doXxx")` 의 `doXxx`) 또는 inline SQL key
- `sqlMappings.extractedPatterns` → C# 안의 `AppDB.Execute(...)` / `MainQuery.Get(...)` 호출 패턴

추후 alias 키 추가가 필요하면 별도 마이그레이션으로 다룬다.
