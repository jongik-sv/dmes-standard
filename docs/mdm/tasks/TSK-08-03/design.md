# TSK-08-03 설계 — 열 설정·피벗·결과 열 그룹·산출 룰·입력 계약

> entry-point: 포털 `/portal` → `mdm:dme/ruleEdit` (메뉴: 마루 MDM > 업무기준 > 룰 화면). 기준선·게이트 명령은
> `docs/mdm/tasks/TSK-08-03/state.json` 의 baseline 을 글자 그대로 쓴다. 도커 금지(mssqlMigrationTest 제외는 baseline 참조).

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않도록 적는다)

TSK-08-02 골격이 이 작업의 자리를 이미 만들어 두었다. 확장점은 세 곳뿐이고, 그 외는 신규 파일 추가로 끝난다.

1. **프런트 접합점**: `src/frontend/m-mdm/pages/dme/ruleEdit/cards.ts` 에 `RULE_TABLE_SECTIONS: RuleTableSection[]`
   (빈 배열) 와 주석 "08-03 은 표 카드 아래 섹션(열 설정·입력 계약·피벗)을 `RULE_TABLE_SECTIONS`에 더한다".
   `DecisionTableCard` 는 마지막에 `extraSections` 를 `CardFrame` 안 검사 요약 아래에 렌더한다. 섹션 컴포넌트는
   공통 props `RuleEditCardProps { view, me, editable, reload, selectVer, notify, runWrite, setDirty, canDo, busy }` 를 받는다.
   DERIVE 룰일 때 표 카드는 이미 `"산출 룰은 열 설정(TSK-08-03)에서 편집한다"` 안내(`data-testid="dt-derive-notice"`)를 낸다.
2. **백엔드 접합점**: `mdm/lib/.../dme/ruleEdit/service/RuleEditSavePart.java` — javadoc "TSK-08-03이 COLUMNS 빈을 더한다
   (기존 줄을 고치지 않는다)". `RuleEditService.save()` 가 `parts.get(request.getPart())` 로 전략을 고른다. 현재 구현 HEADER·TABLE.
   파사드는 `@Transactional` 금지(I25)이고 `RuleTableService` 는 생성자에서 만든 `TransactionTemplate tx` 로 원자성을 준다 —
   COLUMNS 파트도 같은 방식.
3. **저장 칼럼은 이미 있다**: 엔티티 `MdmRuleVar`(TB_MDM_RULE_VAR)에 `axis·resGrp·grpCond·grpCondAst·collectAgg·prioList` 전부
   매핑돼 있다. DDL(V8 Flyway)도 동일. **별도 테이블·화면 전용 JSON 금지가 설계 결정이다**(06:1010, 검토서 122).
   엔티티 javadoc: "JPA 는 모든 칼럼을 INSERT 에 넣으므로 collectAgg 가 null 이면 DB 기본값 'LIST' 가 아니라 NULL 이 들어간다.
   기본값은 저장 로직(TSK-08-03)이 채운다" — 이 작업의 몫.
4. **EvalEx 재사용 지점**: `maru-mdm-engine/.../expr/` 의 `AstExporter`(식 텍스트→AST Map), `ExpressionChecker`(파싱·검사),
   `MdmEvaluator`(설정·평가). 화면은 AST JSON 만 해석하고 절대 JS 파서를 만들지 않는다(evalex-guide §8).
5. **TS 자산이 이미 있다**: `m-mdm/src/evalex/` — `rule-model.ts`(RuleVarDef 에 resGrp·grpCondAst 포함),
   `rule-preview.ts`(`previewRule`, 화면 평가+서버 폴백), `input-contract.ts`(`computeInputContract`, TSK-03-04 §6.7),
   `rule-analysis.ts`(`analyzeRule`, RuleIssueCode 7종). 입력 계약 표는 `computeInputContract` 을 재사용해 계산만 한다.
   계약의 타입은 `src/contract/engine-contract.generated.ts`(json-schema 생성물, `gen:contract`).
6. **피벗의 정확한 조건** (시안 06-business-rule.html 1900–1908 `pvSpec`, 그대로 옮긴다):
   - 피벗이 **보인다**: DECISION ∧ axis ROW 조건 열 ≥1 ∧ axis COL 조건 열 ≥1 ∧ 결과 열이 정확히 1개.
   - 피벗에서 **편집한다**: 행 축이 조건 열 1개·disp `2` ∧ 열 축이 조건 열 1개·disp `Equal` ∧ 결과 disp `Value`.
   - 저장은 항상 의사결정표 행(평탄화) 그대로. **엔진은 axis 를 읽지 않는다.**
7. **BASE_SPD_LKP 는 피벗 편집 모양이 아니다**: 결과 열 8개(그룹 `BASE_SPD`)라 pvSpec 의 "결과 열 1개" 에 안 걸린다.
   이 룰은 **결과 열 그룹(res_grp·grp_cond) 편집**의 표준 샘플이다. 피벗 편집 데모는 결과 열 1개 모양의 별도 룰이 필요하다
   (axis ROW/COL 실데이터가 샘플·mdm.db·시안 어디에도 없다 — 전부 'NONE'/NULL).
8. **E2E 골격이 이미 있다**: `src/frontend/e2e/mdm-ruleEdit.spec.ts`(S1~S11, serial, `--workers=1`),
   픽스처 `e2e/fixtures/mdm-ruleEdit-data.sql`, 서버 절차는 TSK-08-02 design.md 「E2E 서버 절차」(613줄) 를 그대로
   따르되 슬롯 이름·스크린샷 디렉터리만 이 작업 값으로 바꾼다.
9. 함정: `ResolvedVar` record 의 칼럼 이름·순서는 "08-03·08-04가 그대로 쓰도록 고정한다"(08-01 불변) — 필드 추가 금지,
   확장은 `RuleEditViewResult` 에 새 필드로. `mdm-local-sample.sql`(untracked) 은 운영·자동 테스트에 안 쓰는 로컬 화면 확인용
   (INSERT OR IGNORE). E2E 픽스처는 `MdmBusinessRuleMigrationTest` 460줄~ 의 06 샘플 INSERT 에서 옮긴다(감사 칼럼 채워서).

## 1. 접근 방식

08-02 골격이 남긴 확장점(프런트 `RULE_TABLE_SECTIONS`, 백엔드 `RuleEditSavePart` 의 part=COLUMNS, 엔티티·DDL 의
axis·res_grp·grp_cond 칼럼)을 그대로 소비한다. 열 설정은 의사결정표 아래 섹션에서 모든 열을 한 번에 고치는
**초안 → 전체 검사 → 원자 적용/초안 버리기** 흐름이고, 적용 결과는 TB_MDM_RULE_VAR 한 테이블에 저장한다 —
피벗(axis)도 결과 열 그룹(grp_cond)도 DERIVE 산출 순서(seq)도 전부 이 표의 칼럼이며, 피벗은 저장 표현이 아니라
평탄화된 행을 axis 로 다시 펼쳐 보이는 화면 표현일 뿐이다. 식의 파싱은 서버 EvalEx 가 단일 진원이고(디바운스로
`parseExpr` 액션을 부른다), 화면은 파싱 결과(AST·참조 변수·화이트리스트 여부)와 화면 평가(`previewRule`)만 보여준다.
입력 계약은 저장하지 않는 계산값이므로 화면이 기존 `computeInputContract` 로 계산하고, RELEASED(base) 버전과의
diff 는 서버가 view 응답에 `baseVars` 를 추가해 화면이 같은 함수로 견주게 한다. 이렇게 하면 새 저장 구조가 하나도
생기지 않고, 이번 작업의 실질은 ①검사 규칙의 서버·화면 이중 구현(원자 적용) ②피벗 왕복 변환 ③계약 묶음·diff 렌더,
즉 UI 와 저장 검사에 집중된다.

## 2. 변경 파일 목록

### 2.0 Build 단계 분할 (이 순서로 한다. 단계마다 그 단계 테스트가 초록이어야 다음으로 간다)

1. 백엔드 COLUMNS 파트(저장·검사·부수 효과) + `RuleColumnsServiceTest`
2. 백엔드 `parseExpr` 액션(BPMN 갈래) + view 확장(`varCandidates`·`baseVars`) + 테스트
3. 프런트 타입·api 확장 + 열 설정 섹션(초안·검사·적용·도메인 검색) + Vitest
4. `ExprField`(자동완성·디바운스 파싱·화이트리스트 표시) + 그리드 식 칸·열 설정 식 칸에 적용
5. 피벗 섹션 + Vitest
6. 입력 계약 섹션(+RELEASED diff) + Vitest
7. E2E 시나리오 추가·픽스처·스크린샷, 로컬 샘플 확장

### 2.1 생성 (프런트)

- `src/frontend/m-mdm/pages/dme/ruleEdit/sections/index.ts` — `RULE_TABLE_SECTIONS` 에 열 설정→피벗→입력 계약 순으로 push.
- `sections/columns/ColumnSettingsSection.tsx` — 열 설정 표. 줄=열, 칸은 var_id·구분·순서(▲▼, 조건/결과 묶음 안)·표시 타입·
  변수·결과 변수명(입력 치+datalist 자동완성)·표시명·값 타입(기본 타입 4버튼+도메인 검색)·axis(COND 만 NONE/ROW/COL)·
  그룹(RESULT 만, placeholder "그룹 = 결과 변수")·열 조건(RESULT 만, "비우면 기본 열")·집계·순위(COLLECT/PRIORITY 결과열만)·
  설명·검사·삭제. 버튼: 조건 열 추가·결과 열 추가·**열 설정 적용**(dirty 일 때만)·**초안 버리기**. 읽기 전용(비DRAFT·비소유자·EXTERNAL)이면
  11칸 읽기 전용 표. 초안은 sessionStorage 키 `mdm-ruleEdit-colDraft:{ruleId}:{ver}`(시안 ST.cd 관례).
- `sections/columns/column-draft.ts` — 초안 모델(ColumnDraftRow)·줄별 검사 `checkColumnDraftRow`(거부/알림: 아래 검사표)·
  `applyColumnDraft`(원자 적용 계산: 새 var_id 부여, 표시타입·변수 변경 열의 셀 비움 목록, 삭제 열·셀 목록, seq 재배열).
  순수 함수로 만들어 Vitest 대상.
- `sections/columns/DomainSearchBox.tsx` — 도메인 검색 위젯. ID·이름·타입 입력 → 8건까지, ID 앞부분 일치 우선, 초과 시
  "N건 중 8건" 안내, 각 줄에 타입·자리수·검증식.
- `sections/pivot/PivotSection.tsx` — pvSpec 판정 후 피벗 표. 편집 가능일 때만 입력 칸(셀=data-pvc, 구간 ±, 하한·상한·부등호),
  아니면 "화면 표현" 배지 + "이 표는 피벗에서 편집하지 않는다… 아래 의사결정표에서 고친다". 저장은 기존 TABLE 파트(saveRowsOf)를
  그대로 쓴다(평탄화 저장이므로 새 저장 경로를 만들지 않는다). `pvReorder`(구간 하한→상한→열 순서) 적용.
- `sections/pivot/pivot-model.ts` — 시안 `pvSpec/pvCols/pvBand/pvReorder` 의 TS 포팅 + `flatten↔pivot` 왕복 순수 함수.
- `sections/contract/InputContractSection.tsx` — 첫 표: 조건 변수(always) 한 줄. 둘째 표: 줄=행, 칸=필수/선택 변수.
  필수·선택 집합이 같은 행을 한 줄로 묶는다(키 `JSON.stringify([req.sort(),opt.sort()])`); 한 줄이면 행 조건 요약을 함께,
  묶인 줄은 "N개 행이 같다"+title 에 행별 조건. DRAFT면 RELEASED 대비 diff 경고(§4 수용 5).
- `sections/contract/contract-view.ts` — `computeInputContract` 래핑: 행 묶음 계산, base(버전) 계약과 diff
  (필수 늘음·선택→필수=경고 / 필수 빠짐·필수→선택=알림).
- `src/frontend/m-mdm/pages/dme/ruleEdit/expr/ExprField.tsx` (+ `useParseExpr.ts`) — 식 입력 칸 공용 컴포넌트:
  datalist 자동완성(varCandidates), 500ms 디바운스 `parseExpr` 서버 파싱(파싱 오류·참조 변수 목록 표시),
  화이트리스트 밖 함수면 "서버 평가로 넘긴다" 표시, 저장된 테스트 케이스가 있으면 그 입력으로 `previewRule` 즉시 평가 미리보기.
  열 설정의 변수(식) 칸·열 조건(grp_cond) 칸·그리드 Expression 셀(`decision-table`)이 함께 쓴다.
- Vitest: `src/frontend/m-mdm/tests/dme/ruleEdit/column-draft.test.ts`, `pivot-model.test.ts`,
  `contract-view.test.ts`, `expr-field.test.ts`, `sections-render.test.ts`(렌더 스모크, happy-dom).

### 2.2 생성 (백엔드)

- `mdm/lib/.../dme/ruleEdit/service/RuleColumnsService.java` — `implements RuleEditSavePart`, `part() = "COLUMNS"`.
  `@Service("ruleEditColumnsPart")` 등 기존 두 파트의 등록 방식을 따른다. `TransactionTemplate` 로 원자 적용.
- `mdm/lib/.../dme/ruleEdit/dto/RuleColumnsSaveRequest.java` — 열 전체 목록(줄마다 varId(신규 null)·varKind·dispType·varName·label·
  domainId/dataType·axis·resGrp·grpCond·collectAgg·prioList·description·deleted) + maruRuleId·ver·rowVersion.
- `mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleEdit/RuleColumnsServiceTest.java` — @TempDir SQLite+Flyway+@Transactional
  관례(MdmBusinessRuleEntityJpaRoundtripTest 패턴). 검증은 `entityManager.createNativeQuery` 로 같은 연결에서.

### 2.3 수정

- `src/backend/mdm/api/src/main/resources/services/dme/ruleEdit.bpmn` — `parseExpr` 갈래 추가(bpmn-skill 로 재검증).
  도메인 검색은 **domainMng 서비스의 기존 search 계열 액션을 먼저 재사용**한다(화면 api.ts 는 serviceId 만 바꿔 부른다).
  적합한 액션이 없으면 ruleEdit.bpmn 에 `searchDomains` 갈래를 추가하고 그 사실을 design.md 이탈란에 적는다.
- `mdm/lib/.../dme/ruleEdit/service/RuleEditService.java` — `parseExpr` 액션 메서드(파사드). 도메인 재사용이 안 되면 `searchDomains` 도.
  파싱·화이트리스트·참조변수 추출은 `ExpressionChecker`+`AstExporter` 재사용(새 파서 금지).
- `mdm/lib/.../dme/ruleEdit/service/RuleViewService.java` + `dto/RuleEditViewResult.java` — 새 필드 2개(ResizableVar 는 건드리지 않는다):
  - `varCandidates: [{name, label, kind}]` — kind ∈ COLUMN(컬럼 사전)·RULE_RESULT(같은 세트의 앞 룰 결과 변수). 소스는
    `RuleVarTypeResolver` 가 쓰는 것과 같은 조회로 뽑는다(중복 로직 새로 만들지 않는다).
  - `baseVars: List<ResolvedVar>` — base(base_ver) RELEASED 버전의 변수 목록(계약 diff 용; baseRows 는 이미 있음).
- `src/frontend/m-mdm/pages/dme/ruleEdit/types.ts` — ColumnDraftRow·VarCandidate·ParseExprResult·ContractView 타입.
- `.../api.ts` — `saveColumnDraft`(part COLUMNS, 표 배열은 `grids.rows` B4 규칙)·`parseExpr`·도메인 검색 호출.
- `.../cards.ts` — `sections/index.ts` import 로 `RULE_TABLE_SECTIONS` 채움(배열 리터럴 자체는 그대로).
- `.../decision-table/DecisionTableCard.tsx`(필요시 `columns.ts`·`VarHeader.tsx`) — ①열 머리 클릭 → 열 설정 표의 그 줄 하이라이트,
  ②열 설정 초안 dirty 면 저장·열 머리 드래그 차단(안내 문구), ③Expression 셀 입력을 `ExprField` 로 교체.
- `src/frontend/e2e/mdm-ruleEdit.spec.ts` — C1~C6 시나리오 추가(§3.3). 스크린샷 경로 `docs/mdm/tasks/TSK-08-03/screens/` 로
  바꾼 새 헬퍼 상수(08-02 스펙의 기존 경로는 그대로 둔다 — 각 스펙이 자기 Task 디렉터리에 남긴다).
- `src/frontend/e2e/fixtures/mdm-ruleEdit-data.sql` — 룰 추가(§3.3 e2e 데이터): BASE_SPD_LKP v1 RELEASED+v2 DRAFT(그룹 8열),
  COIL_WGT_CALC v1 RELEASED(케이스 25434.0 포함), PROD_WGT_CALC v1 RELEASED+v2 DRAFT, E2E_PVT_LKP v1 DRAFT(피벗 편집 모양).
- `src/backend/mdm/sample/mdm-local-sample.sql` — 피벗 데모 룰 추가(`PVT_SPD_LKP`: COND 1 `COIL_THK` disp '2' axis ROW,
  COND 2 `TOP_RESIN_CD` disp 'Equal' axis COL, RESULT 1 `BASE_SPD` Value — 값은 BASE_SPD_LKP 원본 표 평탄화 7행×2열 축소판).
  BASE_SPD_LKP 기존 행은 그대로(그룹 표준 예시). 이 파일은 이 Task 커밋에 함께 들어간다(untracked 해소).

### 2.4 수정하지 않는 것 (명시)

- `ResolvedVar`, `RuleCellsCodec`, `DefaultMdmRuleIdIssuer`, `RuleNativeWrites`, 엔진(`RuleEngine`·`MdmRuleEngine`·`RuleEvaluator`
  등 maru-mdm-engine 평가 경로) — 엔진은 axis·피벗을 모른 채 그대로 둔다.
- 엔티티·DDL·Flyway 마이그레이션 — 칼럼이 이미 다 있다. 새 마이그레이션 파일을 만들지 않는다.
- `TB_MDM_RULE_SYSTEM`·`TB_MDM_RULE_RECV`(보류 테이블, 엔티티 없음 유지). 값 테스트 카드·테스트 케이스 편집(08-04),
  상신·결재 흐름(08-05), 룰 세트 편집.

## 3. 테스트 전략

### 3.1 백엔드 (testAll 안, 도커 없이 SQLite 로만)

`RuleColumnsServiceTest`(@TempDir SQLite+Flyway+@Transactional rollback 관례):

- 원자 적용: 거부 줄 1개 포함 요청 → 예외, native query 로 var·row cells 가 **한 건도 안 바뀜**.
- 신규 열 var_id 발급: `LAST_VAR_ID`+1 갱신·재사용 금지(같은 번호 재발급 시도 거부는 발급기 기존 테스트에 맡김).
- 표시 타입·조건 변수 변경 열 → 그 열의 셀 키가 cells JSON 에서 사라진다(자동 변환 없음). 삭제 열 → 열+셀 함께 삭제.
- seq 재배열: 조건끼리·결과끼리 1..n, UX_TB_MDM_RULE_VAR_SEQ 위반 없음.
- 그룹 검사 전부: FIRST·UNIQUE 외 거부(PRIORITY·COLLECT·ANY·DERIVE), 그룹 열 2개 미만 거부, 그룹 내 데이터 타입 불일치 거부,
  res_grp 값이 그룹 밖 결과 변수 var_name 과 같으면 거부, 기본 열(grp_cond NULL)이 그룹 내 마지막 seq 가 아니면 거부·둘 이상 거부,
  그룹 아닌 열에 grp_cond 거부, grp_cond 파싱 실패·참조 변수 미해결 거부. 저장 후 GRP_COND_AST 가 파싱 결과와 일치(1회 생성).
- DERIVE: 결과 식이 자기 자신·뒤 seq 결과 변수를 참조하면 거부, 앞 seq 참조는 허용; DERIVE 에 조건열·그룹·hit_policy 거부.
- 프로그램 변수(사전·앞룰 결과 아님) 값 타입 미선언 거부; 결과 var_name 버전 내 유일; `COLLECT_AGG` null → 'LIST' 명시 저장 실측.
- axis: COND 가 아니면 거부, 값은 ROW/COL/NONE. 축 조합 완전성(UNIQUE, ROW×COL 조합 빠짐)은 **경고** 로만(저장 안 막음).
- EXTERNAL 룰은 편집 불가(editable=false) — view 결과 재활용.

`parseExpr` 액션 테스트(파사드 테스트 패턴): 정상 식 → ast·refVars·supported, 화이트리스트 밖(`MASTER`) → supported=false,
파싱 오류 → 오류 코드. view 확장 테스트: varCandidates·baseVars 필드 존재·내용.

### 3.2 프런트 단위 (Vitest, `m-mdm/tests/dme/ruleEdit/`)

- `column-draft.test.ts` — 줄별 검사표 전부(값 타입 필수 조건·Expression 표시명 필수·결과 변수명 유일·`_` 예약어·
  EvalEx 상수 이름 금지·식 파싱 결과 반영·"그룹에 든 열에만 열 조건"), 알림 3종(새 열·셀 비움·삭제), 원자 적용 계산
  (거부 1줄 → 적용 결과 없음), seq 이동 경계(조건↔결과 묶음 못 넘음).
- `pivot-model.test.ts` — pvSpec 판정 표(4조건·편집 조건), pivot→flatten→pivot 왕복 일치, pvReorder 정렬, 빈칸 입력=행 생성·
  값 삭제=행 삭제, 열 축 값 순서(앞 룰 결과면 그 룰 행 순서 우선).
- `contract-view.test.ts` — PROD_WGT_CALC 모양(행별 필수 다름)에서 묶음 개수, 계약 JSON(06:202 발췌 형태) 동치,
  base diff 4종 분류(늘음·선택→필수=경고 / 빠짐·필수→선택=알림), grp_cond 참조 변수(TOP_RESIN_CD·COAT_SIDE) 가 always 포함.
- `expr-field.test.ts` — 디바운스 호출(vi.useFakeTimers), 화이트리스트 밖 표시, 자동완성 datalist 소스.
- DERIVE 산출 순서는 `rule-analysis` 에 검사를 더하면 그 테스트도 여기서(자기·뒤 seq 참조 → issue).

### 3.3 브라우저 E2E (dev-discipline 「화면 작업의 브라우저 E2E」)

스모크 넷은 기존 S1(메뉴 이동)·S2(서버 데이터·빈 상태)·S3/S5(수정 1건 화면 조작→반영)·S10(서버 오류 화면 표시) 이
이미 같은 파일에서 커버한다 — 이 작업은 그 기능이 열 설정 섹션에서도 유효함을 추가 시나리오로 증명한다.

| # | 절차와 기대 |
|---|---|
| C1 | BASE_SPD_LKP v2 DRAFT(steward 소유) 열기 → 열 설정 표에 8개 그룹 열(BASE_SPD, TEXTURE…GENERAL)과 열 조건 표시. FLUORO 열 조건 수정 → 적용 → 저장 → 재조회 왕복 일치. 스크린샷 `dme-ruleEdit-cols-grp.png` |
| C2 | E2E_PVT_LKP v1 DRAFT → 피벗 보기 렌더(행 축 COIL_THK 2타입 구간 7·열 축 TOP_RESIN_CD 값) → 셀 하나 편집·구간 하나 추가 → 저장 → 의사결정표 행 수·값이 평탄화 저장과 일치 → 재조회 왕복. 스크린샷 `dme-ruleEdit-pivot.png` |
| C3 | COIL_WGT_CALC 새 버전(v2 DRAFT) → 열 설정에서 결과 식 열 순서를 바꾸는 편집 + 뒤 식이 앞 결과를 참조하는 열 추가(허용) + 자기 참조 식(거부, 원자 적용으로 아무 것도 안 반영) → 저장. 식 칸 미리보기: 케이스 "1.8×1200×1500" 입력으로 `25434.0` 일치. 스크린샷 `dme-ruleEdit-derive.png` |
| C4 | PROD_WGT_CALC v2 DRAFT → 조건별 수식(행마다 결과 식)이 그리드·열 설정에 표시, DRAFT 식 COALESCE(SPEC_GRAV,7.85) 미리보기. 스크린샷 `dme-ruleEdit-formula.png` |
| C5 | C4 상태에서 입력 계약 표: 행별 필수 묶음(코일 LEN/외경/시트 3줄) 표시, RELEASED 대비 diff 경고(SPEC_GRAV 가 필수→선택 = 알림). 스크린샷 `dme-ruleEdit-contract.png` |
| C6 | 도메인 검색 위젯: "SPEED" 검색 → 8건 이내·SPEED_MPM 포함, ID 앞일치 우선. 화이트리스트 밖 식(`MASTER(...)`) → "서버 평가로 넘긴다" 표시 |

e2e 데이터(`mdm-ruleEdit-data.sql` 추가분): 위 2.3 목록. 피벗·DERIVE 시나리오가 데이터를 고치므로 격리 DB 재생성 절차는
08-02 와 동일(한 번만 주입). 스크린샷은 이 Task `screens/` 만 stage 한다.

### 3.4 E2E 서버 절차

TSK-08-02 design.md 「E2E 서버 절차」(613줄) 를 그대로 따른다. 이 작업 값: 슬롯 `e2e-TSK-08-03`, 포트는 실행 시점 빈 번호
(예: mcm 18223·mdm 18316·FE 15223), 스크린샷 `docs/mdm/tasks/TSK-08-03/screens/`. `be-run.sh`·`fe-run.sh` 금지, 자기 PID·자기 포트만
정리, heavy.sh 슬롯 acquire/release, `--workers=1`.

### 3.5 추가 게이트 (커밋 전)

```bash
# 08-02 3.5 와 같은 검사 — 대상 경로에 이 작업 디렉터리 포함
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme src/frontend/m-mdm/src/dme src/frontend/shared/src/components/grid/AgDataGrid.tsx
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme src/frontend/m-mdm/src/dme src/frontend/shared/src/components/grid/AgDataGrid.tsx
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .   # ERROR 0 / WARN 0 유지
# 기준선 게이트(글자 그대로, heavy.sh 로 감싼다)
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test
cd src/frontend && pnpm test:unit:shared
cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint
```

BPMN 을 고쳤으면 `.claude/skills/bpmn-skill/SKILL.md` 검증을, Flyway 는 건드리지 않았으니 `flyway-migration-add` 는 쓰지 않는다.

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 변수명은 컬럼 사전 표준 물리명, 프로그램 변수는 타입 선언 필수 | `column-draft.test.ts`(화면 즉시 검사) + `RuleColumnsServiceTest`(저장 거부) — 양쪽 같은 규칙 목록 |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleEdit.spec.ts` 통과 | §3.3 E2E 전체(S1~S11 회귀 + C1~C6), §3.4 절차 |
| BASE_SPD_LKP 샘플 표시·편집 왕복 일치 | E2E C1(그룹 8열·열 조건 편집 왕복) + `RuleColumnsServiceTest` 그룹 저장·재조회 왕복 |
| COIL_WGT_CALC·PROD_WGT_CALC 샘플 저장·미리보기 일치 | E2E C3·C4(저장·미리보기 25434.0) + `RuleColumnsServiceTest` DERIVE seq 검사 + `pivot-model.test.ts` 아님 — `rule-analysis` DERIVE 확장 테스트 |
| 계약 변경 시 확정 화면 확인란으로 연결 | view 응답 `baseVars` → 화면 diff 계산·경고 표시(E2E C5). 상신(확정) 화면은 08-05 몫 — 이 작업은 경고 목록을 `contractWarnings` 데이터로 노출해 확인란이 소비할 인터페이스를 제공 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| # | 규칙 | 잡을 대상 테스트 |
|---|---|---|
| 1 | 셀 JSON 키는 `op,left,right,list,expr,ast,val` 7개만, 값은 전부 문자열(십진 비교 보존) | `RuleCellsCodec` 기존 테스트 + `RuleColumnsServiceTest`(셀 비움·삭제 후 JSON 형태) |
| 2 | 열 설정 적용은 원자: 거부 줄이 하나라도 있으면 아무 것도 반영하지 않는다 | `RuleColumnsServiceTest#거부포함요청_전현재성`, `column-draft.test.ts` |
| 3 | 피벗은 화면 표현: 엔진은 axis 를 읽지 않고 저장은 항상 평탄화(TB_MDM_RULE_ROW) — 피벗 전용 저장 경로·JSON 금지 | `pivot-model.test.ts`(왕복), 엔진 기존 테스트(SampleRules 세트 — axis 없이 동일 결과) |
| 4 | DERIVE: hit_policy NULL·조건열 없음. 결과 셀은 seq 순서로 평가, 앞 결과 읽기 허용, **자기 자신·뒤 seq 참조 금지** | `RuleColumnsServiceTest`(DERIVE 케이스), `rule-analysis` DERIVE 검사 Vitest |
| 5 | 결과 열 그룹: FIRST·UNIQUE 에서만. 그룹 열 ≥2·그룹 내 데이터 타입 일치·`res_grp` 값은 그룹 밖 결과 var_name 과 불가. 기본 열(grp_cond NULL)은 그룹마다 마지막 seq 하나까지만. 그룹 아닌 열의 grp_cond 거부 | `RuleColumnsServiceTest`(그룹 케이스 전부), `column-draft.test.ts` |
| 6 | 입력 계약은 저장하지 않는 계산값(엔티티·칼럼·마이그레이션 추가 금지). 필수/선택은 AST NULL 가드 분석으로, 사전 `required` 불사용 | `contract-view.test.ts` + "이 작업에서 Flyway 파일·엔티티 필드가 늘지 않았다" 는 Verify 감사 항목 |
| 7 | var_id·row_id·case_id 는 TB_MDM_RULE 카운터로 발급, 한 번 쓴 번호 재사용 금지(버전 복사 시 유지) | `DefaultMdmRuleIdIssuer` 기존 테스트 + `RuleColumnsServiceTest`(신규 열 발급) |
| 8 | 표시 타입·조건 열 변수를 바꾸면 그 열의 셀을 비운다(자동 변환 없음) | `RuleColumnsServiceTest`, `column-draft.test.ts`(알림) |
| 9 | 파싱은 서버 EvalEx 단일 진원: 저장 시 1회 파싱→AST 생성, 텍스트와 AST 는 같은 UPDATE, 화면 JS 파서·재파싱 금지 | `RuleColumnsServiceTest`(grp_cond AST 일치), `expr-field.test.ts`(파싱은 서버 호출만) |
| 10 | JPA 가 DB 기본값을 덮으므로 `collectAgg` 등 기본값은 저장 로직이 명시(COLLECT 결과열 'LIST') | `RuleColumnsServiceTest`(저장 후 COLLECT_AGG='LIST' 실측) |
| 11 | `ResolvedVar` 칼럼 고정·파사드 `@Transactional` 금지·BPMN 서비스 구조·`grids.rows` 전송(B4) 유지 | 기존 `RuleEditService` 계열 테스트, oasis-contract-check, bpmn-skill 검증 |
| 12 | UX_TB_MDM_RULE_VAR_SEQ(조건/결과 각각 seq 유일)·RESULT var_name 버전 내 유일 위반 요청은 저장 전에 앱 검사가 차단(DB 제약이 최후 방어) | `RuleColumnsServiceTest`(위반 요청 거부) |
| 13 | 열 설정 초안 dirty 면 TABLE 저장·열 머리 드래그를 막는다(초안 버리기로만 해제) | `column-draft.test.ts` + E2E C1·C3(차단 안내) |
| 14 | EXTERNAL 룰은 조회 전용(열 설정도 읽기 전용), DRAFT·소유자만 편집 | 기존 editable 로직 재사용 + `RuleColumnsServiceTest`(EXTERNAL 요청 거부) |
| 15 | 배포 스냅샷 항목(그룹은 res_grp·열 조건 텍스트·AST, 피벗 메타는 제외, 테스트 케이스는 제외) 구성 불변 — 스냅샷 조립은 이 작업 범위 밖이므로 건드리지 않는다 | 엔진·스냅샷 기존 테스트가 그대로 초록이어야 함(회귀 게이트) |

## 6. 화면·UX 세부 (시안 대응)

- 열 설정 표의 줄 하이라이트: 의사결정표 열 머리(`VarHeader`) 클릭 → 열 설정 표의 대응 줄 배경. 상태는 섹션끼리
  공유하는 `useColumnDraft`(React context 또는 useRuleEdit 확장)로.
- DERIVE 룰: 의사결정표 그리드는 읽기 전용(08-02 안내 그대로), 결과 식 편집·순서는 열 설정 표에서만. DECISION 만
  "조건 열 추가" 버튼.
- 자동완성 datalist 소스는 view `varCandidates`(컬럼 사전 물리명+표시명, 앞 룰 결과 변수). 화이트리스트 밖 이름·
  컬럼 사전 밖 이름(프로그램 변수)은 검사 칸·배지로 구분해 표시한다.
- 스크린샷 6종(C1~C6) 은 fullPage 로 `docs/mdm/tasks/TSK-08-03/screens/` 에 커밋한다.

## 이탈·보류 기록 (Build 가 지키는 것)

- 도메인 검색 액션: domainMng 재사용 우선, 실패 시 ruleEdit `searchDomains` 갈래 추가(여기에 기록).
- 값 테스트 카드·서버 평가(validate)·테스트 케이스 편집은 08-04. 이 작업의 "평가 미리보기" 는 화면 TS `previewRule` +
  케이스 입력뿐이다(서버 평가 API 를 새로 만들지 않는다).
- 상신(확정) 화면 확인란은 08-05 — 이 작업은 `contractWarnings` 데이터·경고 표시까지.
- mssqlMigrationTest 는 이번 작업에서 뺀다(도커 런타임 꺼짐 — 머지 뒤 방언 검증 재시도).

### Build 이탈 기록 (단계 2 잔여·3·4, 담당 A)

- **BPMN action 어휘**: mcm 시드의 action 은 16종 고정(`MdmOasisActionVocabularyTest`)이라 `parseExpr`·`searchDomains` 이름의 새 action 을 만들 수 없다.
  ① `parseExpr` → 기존 `validate`(EDIT 세트)에 연결(method=parseExpr). 08-04 가 값 테스트에 `validate` 를 쓰려면 요청 `target` 으로 Java 가 가른다(BPMN 머리 주석에 적음).
  ② `searchDomains` → `search`(READ)의 `target=DOMAIN` 으로 합쳤다. `search` 의 method 를 `searchRules` 에서 디스패처 `search` 로 바꿨다(target 없으면 기존 룰 고르기).
  화면은 `validate` 권한(`canDo("validate")`)과 편집 가능일 때만 `parseExpr` 를 부른다(READ 사용자 403 방지).
- **view 확장 추가 `varMeta`**: `ResolvedVar` 는 해석값(도메인·타입)이라 되돌려 보내면 사전 타입 열이 선언 타입으로 바뀌고, axis·res_grp·grp_cond 는 아예 없어 적용 시 NULL 로 지워진다.
  그래서 `RuleEditViewResult.varMeta`(varId·axis·resGrp·grpCond·collectAgg·prioList·domainId·dataType 저장 원값)를 더했다(`ResolvedVar` 불변).
- **그리드 Expression 셀은 읽기 전용 유지(D7)**: TABLE 저장 경로가 셀 식의 AST 를 만들지 않아 셀 입력을 편집으로 열면 AST 없는 식이 저장된다. 그래서 `ExprField` 는 열 설정의 식 칸(조건 식·열 조건·산출 결과 식)에만 적용했다.
- **열 머리 드래그**: 공용 `AgDataGrid` 에 열 이동을 저장하는 동작이 없어 차단할 대상이 없다. 차단 판정(`columnDragBlocked`)은 순수 함수로 두었고 표 저장은 실제로 막는다.
- **미리보기**: 저장된 테스트 케이스가 view 에 없어(08-04 몫) 열 설정 섹션의 "미리보기 입력(변수=값)" 한 줄로 서버 AST 를 화면 evalex 로 평가한다.
- **화면 검사 목록 = 서버 목록**: `column-draft.ts` 의 `COLUMN_RULES`(27개, 서버 reject 문구 조각 포함)를 `column-draft.test.ts` 가 `RuleColumnsService.java` 와 양방향 대조한다. 화면이 다루지 않는 서버 전용 검사는 그 테스트의 `SERVER_ONLY_MESSAGES`(기존 var_id 검증·적중 정책 거부·없는 도메인 등). 축 조합 완전성 경고(`PIVOT_COVER_INCOMPLETE`)는 서버 응답 issues 로만 보인다.
- **BPMN 편집**: 처음 XML 을 직접 고쳐 다이어그램 좌표가 빠졌고, `npx -y @cothe/bpmn-tool modify` 로 다시 적용해 바로잡았다(`validate` 경고 1건은 기존의 default flow 미설정).

### Build 이탈 기록 (단계 5·6, 담당 B)

- **DERIVE 산출 순서 검사는 별도 함수**: `analyzeRule` 은 서버 `RuleAnalysis` 와 코퍼스 동치라 결과 목록을 바꾸지 않는다. 그래서 `analyzeDeriveOrder(rule)`(새 이슈 코드 `DERIVE_ORDER`, ERROR)를 `rule-analysis.ts` 에 따로 두고 `analyzeRule` 에 섞지 않았다. 열 설정 화면·서버 `DERIVE_SELF_REF` 저장 검사와 같은 규칙이다. 이 함수를 화면 어디서 부를지는 정하지 않았다(열 설정 초안 검사 `DERIVE_SELF_REF` 가 이미 같은 규칙으로 막는다).
- **피벗은 표 카드 상태를 공유하지 않는다**: `PivotSection` 은 view 의 저장 행(`view.rows`)으로 자기 초안을 만들고 저장은 `saveTable`(TABLE 파트)로 한다. 표 카드의 저장 안 한 편집과 동시에 열어 두면 피벗 저장 뒤 view 가 다시 불러와져 표 카드 편집이 사라진다(기존 reload 동작). 앞 룰 결과의 열 축 값 순서(`priorOrder`)는 모델 함수가 받지만 화면은 아직 값을 넘기지 않는다(view 에 앞 룰 행이 없다). base 버전 대비 노란 칸 표시도 넣지 않았다.
- **입력 계약의 식 AST**: 식 변수(조건)·열 조건(grp_cond)의 AST 는 view 에 실려 오지 않아 섹션이 서버 `parseExpr` 로 받는다. validate 권한이 없거나 편집 불가면 부르지 않고 `pending` 안내를 낸다(그 식이 읽는 변수는 always 에서 빠진다).
- **base 계약의 열 조건**: view 에 base 버전의 `varMeta` 가 없어 base 계약은 지금 버전의 `varMeta`(같은 var_id)를 쓴다. 열 조건 참조가 base 와 지금 사이에 바뀐 경우 diff 가 그 변경을 못 잡는다(백엔드 `baseVarMeta` 추가 시 해소).
- **계약 타입 표시**: 룰 열에 없는 변수(결과 식이 읽는 사전 변수)는 화면에 타입이 없다. 그 이름은 타입 툴팁 없이 이름만 보인다.
- **`contractWarnings` 노출**: `contract-view.ts` 의 `contractOfView(view, asts).contractWarnings`(WARNING 문장 목록)와 `contractWarnings(diffs)` 로 노출한다. 08-05 확정 화면이 이 함수를 그대로 부른다.

### Build 이탈 기록 (단계 7, 담당 C)

- **E2E 서버 격리**: 08-02 절차의 "src/backend/data 의 mcm.db·mdm.db 를 옮기고 새로 시작" 은 이 PC 에서 쓸 수 없다. 사용자의 로컬 mdm(8096)·mcm(8100)이 같은 폴더를 쓰고, mcm 은 `LocalSqliteDataSource.resolveBackendDataDir()`(user.dir 에서 위로 `src/backend/data` 를 찾음)가 `--spring.datasource.url` 을 덮어쓴다. 그래서 mdm 은 `--spring.datasource.url=jdbc:sqlite:<임시>/mdm.db` 로, mcm 은 `bootJar` 를 임시 폴더(`<임시>/src/backend/mcm`, 그 위에 `src/backend/data`)에서 `java -jar` 로 띄웠다. 포털은 `m-mcm/.next` 잠금(사용자의 5100 dev)과 겹쳐 m-mcm 소스를 `src/frontend/.e2e-TSK-08-03/` 로 복사하고 `node_modules` 만 링크해 별도 dev 서버(15223)로 띄운 뒤 지웠다(심볼릭 링크만으로는 `app` 을 못 찾는다). 첫 시도에서 mcm 이 사용자의 `src/backend/data/mcm.db` 를 잠시 열었다(caravan 허브 설정 갱신 문장 8건, 기동 즉시 종료).
- **스펙 실행 범위**: `mdm-ruleEdit.spec.ts` 전체(S1~S11 + C1~C6·C2b)와 `mdm-ruleMng.spec.ts` 를 돌렸다. `mdm-shell-rbac-smoke.spec.ts` 는 TSK-01-03 스크린샷을 덮어써 원복이 필요하므로 뺐다(시드 대조는 `mdm-rbac-seed-check.sql` diff 로 대신 통과).
- **C3**: 산출 룰의 새 결과 열은 표시 타입을 `Expression` 으로 바꿔야 한다(`DERIVE_EXPR_ONLY`). 순서 이동으로 "뒤 순서 참조" 거부, 자기 참조 거부·적용 시 요청 없음, 고쳐서 적용 왕복까지 화면으로 확인했다. 식 미리보기는 저장된 케이스 대신 "미리보기 입력" 한 줄이며 `= 25434.0` 이다.
- **C4**: 그리드 Expression 셀이 읽기 전용이고 열 설정에는 DECISION 결과 식 칸이 없다. 그래서 DRAFT 식의 `COALESCE(SPEC_GRAV, 7.85)` 는 그리드 표시로 확인하고, 식 미리보기는 C3 로 옮겼다.
- **C5**: 묶음 3줄(코일 LEN·코일 DIA·시트)과 알림 "필수 입력이 선택이 되었습니다: SPEC_GRAV", 경고 0건을 확인했다. PROD_WGT_CALC v1 이 SPEC_GRAV 필수, v2 가 COALESCE 로 선택이 되는 픽스처다.
- **C6**: 화이트리스트 밖 함수는 `MASTER("PORT", "ALL", SURF_GRD)`(3~4 인자 필수, 2 인자는 파싱 오류)로 조건 식 열에서 확인했다. 도메인 검색은 SPEED 로 SPEED_MPM 이 나오고 8건 이내다.
- **C2b 추가**: 결과 열이 여럿인 BASE_SPD_LKP 는 피벗 섹션이 아예 안 보인다(pvSpec 판정)는 것을 확인하는 시나리오를 더했다.
- **스크린샷**: 포털은 안쪽 영역이 스크롤되어 fullPage 가 해당 섹션을 못 담는다. 각 스크린샷 전에 대상 섹션을 `scrollIntoViewIfNeeded` 로 보이게 했다.
- **화면 미구현 2건(검증 안 함, 보고만)**: 앞 룰 결과의 열 축 값 순서, base 대비 노란 칸.
- **변이 검증 보강**: 백엔드 불변 1(셀 JSON 7키)은 처음 변이가 살아남아 DERIVE 셀 키·문자열 단언을 `RuleColumnsServiceTest` 에 더했고, 불변 11 은 잡는 테스트가 없어 `RuleEditFacadeContractTest`(Transactional 금지·ResolvedVar 칼럼 고정)를 새로 추가했다.

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| 2 원자 적용 | `applyColumnDraft` 가 거부가 있어도 요청 본문을 만든다 | `column-draft.test.ts` 거부 줄이 하나라도 있으면 요청 본문을 만들지 않는다 | 잡힘 |
| 4 DERIVE 순서 | 뒤 seq 참조 검사를 무력화(`slice(i+99)`) | `column-draft.test.ts` 앞 순서 결과 참조는 허용하고 자기 자신·뒤 순서 참조는 거부한다 | 잡힘 |
| 5 결과 열 그룹 | 기본 열이 마지막이 아니어도 통과 | `column-draft.test.ts` 기본 열은 하나뿐이고 그룹의 마지막 | 잡힘 |
| 8 셀 비움 | 표시 타입 변경 알림 누락 | `column-draft.test.ts` 표시 타입을 바꾼 열은 셀을 비운다는 알림 | 잡힘 |
| 9 서버 파싱 단일 진원 | 디바운스 지연 0 | `expr-field.test.ts` 디바운스 서버 파싱 | 잡힘 |
| 9 서버 파싱 단일 진원 | expr 폴더가 evalex `usedVariables` 를 import | `expr-field.test.ts` 화면 JS 파서 금지 | 잡힘 |
| 13 초안 dirty 차단 | `tableSaveBlocked` 가 항상 false | `column-draft.test.ts`, `sections-render.test.ts` | 잡힘 |
| 13 초안 dirty 차단 | 카드가 `saveBlocked` 를 무시하고 표 저장 활성 | `sections-render.test.ts` 초안이 dirty 이면 표 저장이 꺼진다 | 잡힘 |
| 11 BPMN 구조 | validate 태스크 method 를 `view` 로 | `DmeBpmnActionTest` (Gradle `--fail-fast`) | 잡힘 |
| 3 피벗은 화면 표현 | `flattenPivot` 이 기본 행을 버림 | `pivot-model.test.ts` pivot → flatten 은 원래 행과 같다·왕복 | 잡힘 |
| 3 피벗은 화면 표현 | 값 삭제해도 행을 안 지움 | `pivot-model.test.ts` 값을 지우면 그 행을 지운다 | 잡힘 |
| 3 피벗은 화면 표현 | `pvSpec` 편집 조건에서 결과 Value 조건 제거 | `pivot-model.test.ts` 열 축이 Equal 이 아니거나… 편집하지 않는다 | 잡힘 |
| 4 DERIVE 순서 | `analyzeDeriveOrder` 가 자기 자신 참조를 허용(`slice(i + 1)`) | `evalex-rule-analysis.test.ts` 자기 자신을 읽는 식은 오류다 | 잡힘 |
| 6 입력 계약(계산값) | 열 조건 AST 를 계약에 반영하지 않음 | `contract-view.test.ts` BASE_SPD_LKP always 에 TOP_RESIN_CD·COAT_SIDE | 잡힘 |
| 6 입력 계약(계산값) | 필수 늘음 경고를 알림으로 뒤바꿈 | `contract-view.test.ts` diffContract 4종·contractWarnings | 잡힘 |
| 6 입력 계약(계산값) | 행 묶음 키가 선택 집합을 무시 | `contract-view.test.ts` 필수가 같아도 선택 집합이 다르면 다른 묶음 | 처음엔 살아남음 → 그 케이스 테스트를 더한 뒤 잡힘 |
| 13 초안 dirty 차단 | 피벗 저장이 열 설정 dirty 를 무시 | `sections-render.test.ts` 피벗 섹션 열 설정 초안이 dirty 이면 저장이 꺼진다 | 잡힘 |
| 1 셀 JSON 7키 | 산출 식 셀에 `note` 키를 더해 저장 | `RuleColumnsServiceTest` DERIVE 결과 식은 셀에 저장되고… (키 집합·문자열 값 단언을 이 담당이 보강) | 처음엔 살아남음 → 단언을 더한 뒤 잡힘 |
| 2 원자 적용 | 검사 전에 적용을 돌리고 트랜잭션을 끈다(`PROPAGATION_NOT_SUPPORTED`) | `RuleColumnsServiceTest` 거부 줄이 하나라도 있으면 변수와 셀 어디도 바꾸지 않는다 | 잡힘(검사 순서만 바꾸는 변이는 롤백이 가려 동치라 트랜잭션 변이를 함께 쓴다) |
| 4 DERIVE 순서 | 자기 자신 참조 허용(`j = i + 1`) | `RuleColumnsServiceTest` DERIVE 결과 식은 자기 자신과 뒤 seq 결과 변수를 참조할 수 없다 | 잡힘 |
| 5 결과 열 그룹 | FIRST·UNIQUE 외 적중 정책 그룹 거부 제거 | `RuleColumnsServiceTest` 그룹은 FIRST·UNIQUE 룰에만 두고 열이 2개 이상이어야 한다 | 잡힘 |
| 7 번호 발급 | 신규 var_id 발급 시작값을 1 낮춤 | `RuleColumnsServiceTest` 순서대로 저장하고 seq 는… 신규 열은 발급한다 | 잡힘 |
| 8 셀 비움 | 바뀐 열의 셀을 제거하지 않음 | `RuleColumnsServiceTest` 표시 타입이나 변수가 바뀐 열의 셀은 비우고… | 잡힘 |
| 9 서버 AST 1회 저장 | grp_cond AST 저장을 null 로 | `RuleColumnsServiceTest` grp_cond 는 파싱과 참조 변수 해결이 되어야 하고 AST 를 한 번 만든다 | 잡힘 |
| 10 collect_agg 기본값 | COLLECT 결과 열 기본 'LIST' 를 null 로 | `RuleColumnsServiceTest` COLLECT 결과열의 기본 집계는 LIST 이고… | 잡힘 |
| 11 파사드 `@Transactional` 금지 | `RuleEditService` 에 `@Transactional` 부착 | 새 `RuleEditFacadeContractTest` 파사드와 COLUMNS 파트에는 Transactional 을 붙이지 않는다(이 담당이 추가) | 처음엔 잡는 테스트가 없음 → 테스트를 더한 뒤 잡힘 |
| 11 `ResolvedVar` 칼럼 고정 | 같은 타입인 `varKind`·`dispType` 순서 교환 | 새 `RuleEditFacadeContractTest` ResolvedVar 칼럼 이름과 순서는 고정이다 | 잡힘 |
| 12 결과 변수명 유일 | 중복 결과 변수명 검사 제거 | `RuleColumnsServiceTest` 프로그램 변수는 값 타입을 선언해야 하고 결과 변수명은 버전 안에서 유일하다 | 잡힘 |
| 12 seq 유일 | 결과 열 seq 를 항상 1 로 | `RuleColumnsServiceTest` 순서대로 저장하고 seq 는 조건과 결과 각각 1부터… | 잡힘 |
| 14 EXTERNAL 조회 전용 | `requireMdm` 검사 제거 | `RuleColumnsServiceTest` EXTERNAL 룰 비소유자 row_version 불일치는 거부한다 | 잡힘 |
| 15 배포 스냅샷 구성 불변 | 변이 없음 — 이 작업은 스냅샷 조립 코드를 건드리지 않았다(변경 파일에 없음) | 엔진·스냅샷 기존 테스트(오케스트레이터 회귀 게이트) | 해당 없음(보고) |
