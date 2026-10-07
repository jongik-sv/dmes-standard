# mdm 길이 검사 감사 (ORA-12899 대비)

서브에이전트 4개로 표를 나눠 조사했고, "직접 확인"이라고 적은 항목만 grep 으로 다시 확인했다. 나머지는 서브에이전트 보고를 그대로 옮겼다. 파일은 고치지 않았다.

경로 기준은 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 이다.

## 공용 검사 도구 현황
- `NamingRules.length()` 는 코드 포인트 수로 센다. 상수는 `COLUMN_NAME_MAX`, `CODE_MAX`(50), `TERM_NAME_MAX`, `CONTEXT_MAX`, `ENG_NAME_MAX`(각 100), `DESCRIPTION_MAX`(20,000) 이다.
- `DESCRIPTION_MAX` 는 컬럼 사전의 CLOB 칸 전용이다. 4000 BYTE 칸에 쓰면 안 된다.
- `RuleLimits` 의 `MAX_EXPR_CHARS`, `MAX_CASE_NAME_CHARS` 등은 룰 셀과 테스트 케이스 전용이다.
- 각 서비스의 `NAME_MAX`(100)·`ID_MAX`(50)·`LABEL_MAX`(100)와 `ColumnMngService.maxLength(...)`·`TermRegPopService.maxLength(...)` 가 그 밖의 검사다.
- 직접 확인: `4000`·`1333` 상한이나 ORA-12899 번역 코드는 `lib/src/main` 과 `api/src/main` 어디에도 없다.
- 직접 확인: `MasterCodeItemChecks`, `DataItemChecks`, `MasterCodeCateChecks` 에는 길이 검사가 한 줄도 없다.
- `MasterCodeItemValues` javadoc 은 "길이 검사는 구현(06-03)이 한다"고 적었지만 구현에는 없다.

## 1. 위험·확인 못함 칸

### (A) 4000 BYTE 칸

| 표.컬럼 | 입력 출처 | 검사 위치 | 상한 | 판정 |
|---|---|---|---|---|
| TB_MDM_TERM.TERM_NAME, CONTEXT, ENG_NAME | termMng 화면 저장 | `TermMngService.save`, 검사 없음(직접 확인) | 없음 | 위험 |
| TB_MDM_TERM.DEFINITION, STD_BASIS | termMng 저장, termRegPop 등록(DEFINITION) | 두 경로 모두 필수 여부만 | 없음 | 위험 |
| TB_MDM_TERM.SYNONYMS, ALIASES, SYSTEMS | termMng 저장. 콤마로 나눠 JSON 배열로 직렬화 | 없음 | 항목 수·길이 모두 없음 | 위험 |
| TB_MDM_DOMAIN.DOMAIN_NAME, DESCRIPTION | domainMng 저장 | `DomainRuleChecker.requiredAndFormat`, null·trim 만 | 없음 | 위험 |
| TB_MDM_DOMAIN.EXAMPLES | 예시 그리드, `DomainTestCases.examplesToJson` | 없음 | 행 수·값 길이 없음 | 위험 |
| TB_MDM_DOMAIN.STD_RULE, BIZ_RULE | 식 입력 | `DomainExpressionCompiler.check` 가 엔진 `ExpressionChecker` 에 위임 | 엔진에 길이 검사 없음(서브에이전트 보고) | 위험 |
| TB_MDM_COLUMN_SYSTEM.NOTE | columnMng 시스템 그리드 | `ColumnMngService.validateMappings` 가 note 를 검사하지 않음 | 없음 | 위험 |
| TB_MDM_COLUMN.TERM_IDS | 용어 그리드, ID JSON | `resolveTermIds` 가 존재만 확인 | 행 수 상한 없음 | 낮은 위험 |
| TB_MDM_LAYOUT.LAYOUT_NAME | 전문·헤더 저장 | `LayoutDraftBuilder.build`, `HeaderMngService.save`, null 만 | 없음 | 위험 |
| TB_MDM_EAI.EAI_NAME, PAD_RULE | `HeaderMngService.save` | 없음 | 없음 | 위험 |
| TB_MDM_LAYOUT_VER.CHANGE_SUMMARY | 확정 때 `LayoutChangeClassifier.classify` 가 변경 문구를 `", "` 로 이어 붙임 | `LayoutVersionStore.recordConfirm` 에 길이 처리 없음 | 항목 수 제한 없음 | 위험(사용자 입력이 아닌 조립 문자열) |
| TB_MDM_CODE_ITEM.NAME, ALTER_NAME, DESCRIPTION, ATTR01~10 | 항목 그리드·붙여넣기, 경미 수정 | `MasterCodeItemChecks.checkRow` 는 "라벨 없는 칸에 값 금지"만 봄 | 없음 | 위험 |
| TB_MDM_CODE_CATE.CATE_NAME, DEF_EXPR, DESCRIPTION | 카테고리 그리드·단건 | `MasterCodeCateChecks.checkDefinition`, 빈 값·정규식 문법만 | 없음 | 위험 |
| TB_MDM_CODE.DESCRIPTION | `CodeMngService.register`, `CodeEditService.saveHeader` | 같은 메서드의 `NAME_MAX` 는 이름에만 적용 | 없음 | 위험 |
| TB_MDM_DATA.CODE_PATTERN, DESCRIPTION | `DataMngService.register`, `DataEditService.save` | 필수·`Pattern.compile` 만 | 없음 | 위험 |
| TB_MDM_DATA_ITEM.NAME, ALTER_NAME, DESCRIPTION, ATTR01~10 | 항목 그리드, CSV 업로드(`DataCsvUploadPopService` 도 같은 `DataItemSaveCore` 를 거침) | `DataItemChecks.rowIssues` 는 필수·라벨 없는 칸 값 금지만 | 없음 | 위험 |
| TB_MDM_DATA_CATE.CATE_NAME, DEF_EXPR, DESCRIPTION | `DataCateEditService`, `DataCategorySegmentCore` | `DataItemChecks.cateDefIssues` 에 길이 없음 | 없음 | 위험 |
| TB_MDM_RULE_VAR.LABEL, DESCRIPTION | 열 설정 화면 | `RuleColumnsService.check`, 빈 값만 | 없음 | 위험 |
| TB_MDM_RULE_VAR.GRP_COND | 열 설정 화면 | 문법 검사만. `MAX_EXPR_CHARS` 는 이 경로를 거치지 않음 | 없음 | 위험 |
| TB_MDM_RULE_VAR.PRIO_LIST | `List<String>` 을 `DomainJson.write` 로 직렬화 | 없음 | 없음 | 위험 |
| TB_MDM_RULE_VAR.VAR_NAME | 열 설정 화면 | 정규식·예약어만 | 길이 없음 | 위험(낮음). 영숫자만 허용이라 4,000자를 넘어야 넘침 |
| TB_MDM_RULE_ROW.NOTE | `RuleTableService.parseRows` | 없음 | 없음 | 위험 |
| TB_MDM_RULE_TEST_CASE.DESCRIPTION | `RuleTestCaseService.save` | 없음 (`CASE_NAME` 만 100자 검사) | 없음 | 위험 |
| TB_MDM_RULE_SET_TEST_CASE.DESCRIPTION | `RuleSetTestCaseService.save` | 없음 (`CASE_NAME` 만 검사) | 없음 | 위험 |
| TB_MDM_RULE_SET.DESCRIPTION | `RuleSetMngService.register`, `RuleSetEditService.save` | 둘 다 `blankToNull` 만 | 없음 | 위험 |

### (B) CHAR 칸 중 바깥 입력

| 표.컬럼 | Oracle 형 | 입력 출처 | 검사 위치 | 판정 |
|---|---|---|---|---|
| TB_MDM_TERM.ENG_ABBR | 50 CHAR | termMng 저장 | `TermMngService.save` 에 없음(termRegPop 은 정규식과 `CODE_MAX` 로 안전) | 위험 |
| TB_MDM_EAI.EAI_CODE | 20 CHAR | `HeaderMngSaveRequest.eaiCode` | `HeaderMngService.save` 에 길이·형식 없음 | 위험 |
| TB_MDM_LAYOUT_VER.EAI_CODE | 20 CHAR | 헤더 경로는 새 EAI 코드를 그대로 씀 | EAI_CODE 검사가 없으면 같이 실패 | 위 칸에 종속 |
| TB_MDM_EAI.ENCODING | 20 CHAR | `HeaderMngService.save` | 길이·유효성 모두 없음 | 위험 |
| TB_MDM_LAYOUT_ITEM.DEFAULT_VALUE, TB_MDM_LAYOUT_CONST.CONST_VALUE | 50 CHAR | CONST 값 입력 | `LayoutRegistrationRules.constValue` 가 항목 길이 이하만 봄 | 위험. 항목 길이가 50 이하라는 보장이 없고, 실제 분포는 확인 못함 |
| TB_MDM_CODE_ITEM.CODE, LVL1~5 | 50 CHAR | 항목 그리드 새 행 | `checkRow` 는 빈 값·금지 문자만 | 위험 |
| TB_MDM_CODE_CATE.CATE_ID | 50 CHAR | 카테고리 그리드·단건 | `checkDefinition` 에 길이 없음 | 위험 |
| TB_MDM_DATA_ITEM.CODE, LVL1~5 | 50 CHAR | 그리드·CSV 새 행 | `rowIssues` CHK3 는 키 패턴 `matches` 만, CHK5-1 은 콤마·공백만 | 위험 |
| TB_MDM_DATA_CATE.CATE_ID | 50 CHAR | `DataCateEditService.requireCateId`, `registerCate` | 빈 값만 | 위험 |
| TB_MDM_DOMAIN.MARU_CODE_ID, CATE_ID | 50 CHAR | domainMng 저장 | `CodeCategoryValidator.check` 가 존재만 확인. 원장이 없으면 경고만 하고 통과 | 확인 못함(길이 검사 없음, 긴 값이 통과할 수 있음) |
| TB_MDM_RULE_VAR.RES_GRP | 50 CHAR | 열 설정 화면 | 그룹 간 일관성만 봄 | 위험 |
| TB_MDM_RULE_VAR.COLLECT_AGG, DATA_TYPE | 20 CHAR | 열 설정 화면 | 필수·정책 일치만. 허용값 목록 검증을 못 찾음 | 위험(낮음) |
| TB_MDM_META_REV.TARGET_KEY | 100 CHAR | 관리자 강제 기록(`MetaFeedService.keyList`) | 키 개수 500 만 제한 | 낮은 위험 |
| TB_MDM_UNIT.FACTOR | NUMBER(18,9) | `UnitMngService.parseFactor` | 0 초과만 확인 | 문자 칸은 아니지만 1e9 이상이면 ORA-01438 로 같은 방식으로 실패 |

### 확인 못함
- DATA_ITEM 의 API 저장 경로: `DataItemChecks.contentIssues` 는 `DataSavePath.API` 일 때 내용 검사를 통째로 건너뛴다. mdm 의 main 코드에는 호출자가 없고 테스트만 호출한다. 다른 모듈(OASIS·EAI)이 호출하는지는 확인하지 못했다. 호출한다면 외부 수신 값이 길이 검사 없이 들어간다.
- 용어 CSV·SAP 사전을 DB 에 올리는 경로를 못 찾았다. `batch/sapdict` 는 CSV 파일만 만든다.
- 엔진 `ExpressionChecker` 의 식 길이 상한은 직접 읽지 못했다. 서브에이전트는 "길이 검사 없음"으로 보고했다.
- 입력 경로가 없어 현재는 안전한 칸:
  - `TB_MDM_CODE_RECV`, `DATA_RECV`, `DATA_RECV_ITEM`, `RULE_RECV` 의 RESULT_DETAIL·SOURCE_REF·SOURCE_SYSTEM·CODE 등. 쓰는 Java 코드가 없고 읽기(COUNT)와 샘플 SQL 뿐이다.
  - `TB_MDM_CODE_VER`, `RULE_VER` 의 DESCRIPTION·EMERGENCY_REASON·REJECT_REASON·CANCEL_REASON. 세터는 엔티티에만 있고 요청 DTO 에도 해당 칸이 없다.
  - `TB_MDM_CODE_SYSTEM`, `RULE_SYSTEM`, `DICT_SYSTEM`, `DATA_SYSTEM` 의 DESCRIPTION·NOTE. 쓰는 코드를 못 찾았다. 다만 `DATA_SYSTEM` 은 다른 서비스가 직접 INSERT 하는지까지는 확인하지 못했다.
  - 이 칸들에 쓰기 경로가 생기면 같은 상수를 쓰도록 해야 한다.

## 2. 안전 요약
- **TB_MDM_COLUMN**: 나머지 칸이 모두 안전하다. `validateFields` 가 `NamingRules` 상수로 100·24·12·6·50 을 건다. DESCRIPTION 과 USAGE_NOTE 는 CLOB 이다.
- **TB_MDM_COLUMN_SYSTEM**: PHYS_NAME·TRANSFORM 이 안전하다. 둘 다 `validateMappings` 에서 50 으로 검사한다.
- **TB_MDM_TERM**: termRegPop 경로의 TERM_NAME·CONTEXT·ENG_NAME·ENG_ABBR 는 `maxLength` 가 걸려 있다. OWNER_DEPT·SRC_ORIGIN·EMBEDDING_MODEL 은 내부 값이다.
- **TB_MDM_DOMAIN**: STD_NAME(정규식과 50자), DOMAIN_KIND·DATA_TYPE(목록), UNIT_CODE(원장 확인)가 안전하다.
- **TB_MDM_UNIT**: 코드·차원·기준 단위는 정규식으로 20/50/20자로 제한된다.
- **TB_MDM_LAYOUT 계열**: SND·RCV_SYSTEM(코드 목록), SWITCH_MODE·FILL_KIND(enum), COLUMN_PHYS·TRANS_UNIT(원장 존재), NUM_FORMAT(정규식 최대 29자), CHANGE_KINDS(최대 약 120자)가 안전하다.
- **TB_MDM_CODE 와 DATA 헤더**: MARU_CODE_ID·MARU_DATA_ID(`ID_MAX` 50), 이름(`NAME_MAX` 100), ATTR01~10_NAME(`LABEL_MAX` 100)이 안전하다. 4000 BYTE 라도 100자 × 3 = 300바이트다.
- **CATE_ITEM 의 CODE**: 소속 항목이 이미 있어야 하므로 새 값이 들어오지 않아 간접적으로 안전하다.
- **TB_MDM_RULE·RULE_SET·테스트 케이스**:
  - 이름은 `NAME_MAX` 100, `CASE_NAME` 은 `MAX_CASE_NAME_CHARS` 100 으로 검사한다.
  - ID 는 `RuleIdRules`, `RuleSetIdRules` 가 50 과 정규식으로 검사한다.
  - `EVAL_TS` 는 파싱 후 19자라 안전하다(5자리 연도 경우는 실행해 보지 않음).
  - CELLS·FLOW_JSON 등은 CLOB 이다.
- **내부 생성**: 감사 칸(`C_*`·`U_*`), STATUS·*_KIND·*_YN·HIT_POLICY 등 enum, OWNER_ID·REQUESTED_BY·APPROVED_BY(로그인 사용자 ID)는 내부 생성이다.
- **레거시 룰 이관**: `legacy-rule-import` 스킬은 DB 에 직접 쓰지 않고 OASIS 서비스를 호출하므로 화면과 같은 검사를 지난다.

## 3. 길이 검사를 넣을 자리

원칙은 입력 경로마다 따로 검사하지 않고, 이미 여러 경로가 공유하는 순수 검사 클래스에 넣는 것이다. 그러면 save, validate, CSV 가 한 번에 막힌다.

1. **코드 항목**: `common/mastercode/MasterCodeItemChecks.checkRow`.
   - CODE·LVL1~5 에 50, NAME·ALTER_NAME·DESCRIPTION·ATTR01~10 에 4000 BYTE 상한을 넣고, `MasterCodeItemIssueCode` 에 새 코드를 둔다.
   - 경미 수정인 `CodeItemEditService.patch` 는 `checkRow` 를 거치지 않으므로 NAME·ALTER_NAME·DESCRIPTION 검사를 따로 넣는다.
2. **코드 카테고리**: `common/mastercode/MasterCodeCateChecks.checkDefinition`에서 CATE_ID(50)·CATE_NAME·DEF_EXPR·DESCRIPTION 을 검사한다. `CategoryDefinition` 에 description 이 있는지는 확인하지 못했다.
3. **데이터 항목**: `common/segment/DataItemChecks.rowIssues`에서 CODE·LVL(50)과 NAME 계열·ATTR 을 검사한다. 그리드와 CSV 가 `DataItemSaveCore.upsert → contentIssues → rowIssues` 로 같은 길을 지난다. API 경로가 `contentIssues` 를 건너뛰는 문제는 별도로 판단해야 한다.
4. **데이터 카테고리**: `DataItemChecks.cateDefIssues`에서 cateId(50)·cateName·defExpr·description 을 검사한다.
5. **코드·데이터 헤더**: `CodeMngService.register`, `CodeEditService.saveHeader`, `DataMngService.register`, `DataEditService.save`에 description·codePattern 검사를 추가한다. 이미 있는 `NAME_MAX` 와 `invalid(...)` 형식을 따른다.
6. **용어**: `TermMngService.save`에서 엔티티에 값을 넣기 전에 `TermRegPopService.reg` 와 같은 `maxLength` 를 건다. DEFINITION·STD_BASIS 는 상수를 새로 만든다. `TermRegPopService.reg` 에는 DEFINITION 만 추가한다. SYNONYMS·ALIASES·SYSTEMS 는 항목 수·항목 길이를 제한하고 직렬화한 JSON 의 UTF-8 바이트를 직접 잰다.
7. **도메인**: `DomainRuleChecker.requiredAndFormat`에 DomainIssue 로 넣는다. save 와 validate 미리보기가 같이 쓰므로 한 곳이면 된다. DOMAIN_NAME·DESCRIPTION·STD_RULE·BIZ_RULE·EXAMPLES(`examplesToJson` 결과 바이트)·MARU_CODE_ID·CATE_ID(50)를 검사한다.
8. **컬럼 사전**: `ColumnMngService.validateMappings`의 `want.setNote` 앞에서 NOTE 를 검사한다. TERM_IDS 는 `resolveTermIds` 에서 개수 상한을 둔다. `UnitMngService.parseFactor` 는 `precision - scale > 9` 면 거절한다. `MetaFeedService.keyList` 는 키 100자를 넘으면 거절한다(우선순위 낮음).
9. **전문·헤더**: `LayoutDraftBuilder.build` 의 기본 속성 구간(L11 옆)과 `HeaderMngService.save` ③에서 LAYOUT_NAME·EAI_NAME·PAD_RULE·EAI_CODE(20)·ENCODING(20)을 검사한다. 이 검사는 EAI 행을 저장하기 전에 해야 EAI 저장 뒤 `LAYOUT_VER.EAI_CODE` 에서 실패하는 일이 없다. `LayoutRegistrationRules.constValue` 에 50자 검사를 더하면 DEFAULT_VALUE 와 CONST_VALUE 가 함께 해결된다. CHANGE_SUMMARY 는 오류를 내지 말고 `LayoutChangeClassifier.classify` 끝에서 `…외 N건` 으로 자른다. `LayoutConfirmChecks.classify` 가 EAI 변경 문구를 앞에 붙이므로 그 뒤에 자른다.
10. **룰**:
    - `RuleColumnsService.check` 에서 label·description·grpCond·varName·resGrp·collectAgg·dataType·prioList(직렬화 JSON)를 검사한다. collectAgg·dataType 은 허용값 목록으로 확인하는 편이 낫다.
    - `RuleTableService.parseRows` 에서 note 를 검사한다.
    - `RuleTestCaseService.save`·`RuleSetTestCaseService.save` 의 name 검사 아래에 description 검사를 넣는다.
    - `RuleSetMngService.register`·`RuleSetEditService.save` 에도 description 검사를 넣는다.

### 상한 값 제안
- 공용 상수나 헬퍼를 하나 두는 편이 좋다. 예를 들면 `NamingRules` 옆에 `TEXT_BYTES_MAX = 4000` 과 UTF-8 바이트 길이를 재는 `checkBytes(value, label)` 이다.
- 글자 수 상한을 쓴다면 1,000자가 안전하다. 한글 3바이트 기준 한계는 1,333자지만 이모지는 4바이트라 1,333자에서는 넘칠 수 있다.
- 제일 정확한 방식은 `getBytes(UTF_8).length ≤ 4000` 검사다. 이는 DB 문자셋이 AL32UTF8 이라는 전제이므로 확인이 필요하다.
- CHAR 칸은 `NamingRules.length()`(코드 포인트 수)로 검사하면 된다.
- `String.length()`(UTF-16 단위)는 이모지를 2로 세므로 상한 쪽으로는 보수적이다. 기존 `NAME_MAX` 100 같은 검사는 이 차이와 상관없이 안전하다.
