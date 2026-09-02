# 어휘 매핑표 — Java/PL/SQL → C#/T-SQL

mes-plugin 의 산출물 템플릿(BPA / 레거시 / 프로세스그룹 / 프로시저 분석) 은 부산 프로젝트(GLUE Framework + Java + Oracle PL/SQL) 시절 헤딩으로 굳어졌다. **템플릿 헤딩과 JSON 스키마 키 이름은 그대로 두고**, 본문을 채울 때 본 표로 의미를 SampleErp(C# WinForms + MSSQL T-SQL) 맥락으로 매핑한다.

본 파일은 4개 generate-* / analyze-* 스킬이 공통으로 참조한다.

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

## 3. SQL / 데이터베이스

| 영역 | 부산 (Oracle PL/SQL) | SampleErp (MSSQL T-SQL) |
|---|---|---|
| SQL 본문 위치 | DB 직접 (sqlcl MCP `ALL_SOURCE`) | 정적 파일 (`docs/external/SampleErp/{procedures\|functions\|tables\|views\|triggers}/{이름}.sql`) |
| 분석 단위 | `PACKAGE` / `PROCEDURE` / `FUNCTION` | `PROCEDURE` / `FUNCTION` (패키지 개념 없음 — 보고서 §1 에서 "패키지 없음, MSSQL 단일 프로시저/함수" 명시) |
| 패키지 멤버 호출 | `pkg_name.proc_name(...)` | `dbo.proc_name(...)` (스키마.프로시저) |
| 바인드 변수 | `:변수명`, `#변수명#` | `@변수명` |
| 커서 | `CURSOR c IS SELECT ... ; OPEN c; FETCH c INTO ...; CLOSE c;` 또는 `FOR rec IN (SELECT ...) LOOP ... END LOOP;` | `DECLARE c CURSOR FOR SELECT ...; OPEN c; FETCH NEXT FROM c INTO @v1, @v2; WHILE @@FETCH_STATUS=0 BEGIN ... FETCH NEXT FROM c ... END; CLOSE c; DEALLOCATE c;` |
| 트랜잭션 | `SAVEPOINT sp1`, `ROLLBACK TO sp1`, `COMMIT`, `ROLLBACK` | `SAVE TRANSACTION sp1`, `ROLLBACK TRANSACTION sp1`, `COMMIT TRANSACTION`, `ROLLBACK TRANSACTION` |
| 에러 발생 | `RAISE_APPLICATION_ERROR(-20001, 'msg')` | `RAISERROR('msg', 16, 1)` 또는 `THROW 50001, 'msg', 1` |
| 예외 처리 | `EXCEPTION WHEN ... THEN ...` 블록 | `BEGIN TRY ... END TRY BEGIN CATCH ... END CATCH` |
| 결과 반환 | `OUT 파라미터`, `SYS_REFCURSOR`, `RETURN 값` (FUNCTION) | 결과집합 `SELECT ...`, `OUTPUT 파라미터`, `RETURN 값` |
| 의존성 조회 | `ALL_DEPENDENCIES` 뷰 | 본문 정규식 — `exec\s+(?:dbo\.)?(\w+)`, `dbo\.(\w+)\s*\(` |
| 시스템 카탈로그 | `ALL_OBJECTS`, `ALL_TAB_COLUMNS`, `ALL_SOURCE` | 정적 파일 직접 (`tables/*.sql` 의 `CREATE TABLE` 본문 파싱) |
| Bind 호출 (Java→Oracle) | `getProperty(SQLKEY)` + named parameter | `AppDB.Execute("procName", new { p1=val1, p2=val2 })` 또는 `SqlCommand.Parameters.AddWithValue("@p1", val1)` |
| NULL 처리 | `NVL(x, default)` | `ISNULL(x, default)` 또는 `COALESCE(x, default)` |
| 문자열 연결 | `\|\|` | `+` 또는 `CONCAT` |
| TOP-N | `WHERE ROWNUM <= N` | `SELECT TOP N ...` |
| 시퀀스 | `seq.NEXTVAL` | `IDENTITY` 컬럼, `NEXT VALUE FOR seq` (SEQUENCE 객체) |
| DUAL | `SELECT 1 FROM DUAL` | `SELECT 1` (DUAL 불필요) |

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

| 템플릿 헤딩 | 부산 본문 어휘 (지양) | SampleErp 본문 어휘 (적용) |
|---|---|---|
| BPA §6 "커스텀 클래스 워크플로우" | "Java Activity 200줄+" | "C# partial class 200줄+ — 핸들러/비즈니스 메서드 합산" |
| BPA §8 "화면 구성 개요 (UI만 해당)" | JSP 영역 + Form/Grid XML | Designer.cs 의 `InitializeComponent()` + `.resx` 리소스 |
| 레거시 §"⚙️ Java 컴포넌트 분석" | Java 클래스 헤딩 그대로 | C# partial class — 헤딩 그대로, 본문은 C# 어휘 |
| 레거시 §"JavaScript 모듈" | JSP+JS 함수 | "해당 없음 (WinForms — 클라이언트 JS 미사용)" + 클라이언트 이벤트 핸들러 메서드 표 |
| 레거시 §"이벤트 핸들러" | JSP `onclick=...` | C# Designer.cs 의 `Click += new EventHandler(...)` 매핑 |
| PL/SQL §"프로시저/함수 상세 분석" | PACKAGE 멤버 / PROCEDURE / FUNCTION | (Stored) PROCEDURE / FUNCTION (패키지 개념 N/A — §1에 명시) |
| PL/SQL §"의존성 — 내부 호출 / 외부 의존성" | 같은 패키지 내 / `ALL_DEPENDENCIES` | 본문 정규식으로 `exec dbo.X` / `dbo.X()` 추출 |
| PL/SQL §"제어 흐름 — 트랜잭션 제어" | SAVEPOINT/ROLLBACK TO/COMMIT | SAVE TRANSACTION/ROLLBACK TRANSACTION/COMMIT TRANSACTION |
| PL/SQL §"제어 흐름 — 커서 루프 상세 분석" | `FOR rec IN (...) LOOP` | `WHILE @@FETCH_STATUS=0 BEGIN ... END` |

## 5. JSON 스키마 키 이름 보존 정책

`structure.json` / `java_analysis.json` / `sql_analysis.json` / `ui_analysis.json` 파일명·키 이름 (예: `customActivities`, `javaSqlQueries`, `extractedPatterns`) 은 부산색이 묻어있더라도 **그대로 보존**한다. 산출물 템플릿이 이 키를 참조하므로 이름 변경은 템플릿/스킬 모두 갱신을 강제한다.

값에 들어가는 의미는 본 매핑표대로 SampleErp 맥락으로 채운다. 예시:
- `customActivities` 배열 → C# partial class 안에서 200줄 이상이거나 비즈니스 메서드를 다수 가진 핸들러/비즈니스 메서드 묶음
- `javaSqlQueries` 배열 → C# 코드 안에서 추출한 procedure 호출명 (`AppDB.Execute("doXxx")` 의 `doXxx`) 또는 inline SQL key
- `sqlMappings.extractedPatterns` → C# 안의 `AppDB.Execute(...)` / `MainQuery.Get(...)` 호출 패턴

추후 alias 키 추가가 필요하면 별도 마이그레이션으로 다룬다.
