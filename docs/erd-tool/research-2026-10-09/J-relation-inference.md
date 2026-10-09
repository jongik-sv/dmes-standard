# J: FK 없는 DB 에서 관계 복원 실측 (2026-10-09, 읽기 전용)

작업 폴더: 같은 폴더의 `J/` (스크립트·중간 결과). 접속은 `podman exec -i oracle-26ai-free sqlplus -s <USER>/<로컬 비밀번호>@//localhost:1521/L_MAIN`, SELECT 만 실행(USER_CONSTRAINTS·USER_CONS_COLUMNS·USER_TAB_COLUMNS, TB_MDM_COLUMN/DOMAIN/COLUMN_SYSTEM).
산출물: J/run.sh, fk.sql/pk.sql/uk.sql/col.sql(추출), mdm_*.txt·mcm_*.txt(추출 결과), methodA.mjs, methodC.mjs, evalC.mjs, evalDbml.mjs, union.mjs,
mcmA_x.csv(방법 A MCM 후보 112행), mcmA_xPSF.csv, mdmA_x_FP.txt/FN.txt, methodC_pairs.csv(SQL 조인 쌍 44개), methodC_mcm.csv.
주의: 휴지통 객체(BIN$...)가 USER_* 뷰에 섞여 나오므로 모두 제외함. 두 스키마 모두 flyway_schema_history 제외.

## 0. 한 줄 결론
- 정답(MDM FK) 대비: 칼럼명 규칙(A)은 표 쌍 기준 정밀도 0.57·재현율 0.78 (칼럼 쌍 기준 0.43/0.69), SQL 조인(C)은 정밀도 0.88~0.91·재현율 0.14~0.16, JPA 엔티티(B)는 연관 어노테이션 0건이라 0, 컬럼 사전(D)은 근거 거의 없음.
- 프로젝트에는 사람이 쓴 논리 FK 문서가 이미 있다(docs/mcm/erd/csa-menu.dbml `Ref:` 27 + notice.dbml 2 = 29관계/24표). 이것을 MCM 부분 정답으로 삼으면 A 는 재현율 0.93·정밀도 0.57.
- MCM 56표(실표 55 + flyway)에서 A∪C 후보 표 쌍 102개, 문서 29개와 합치면 104개. 그중 사람이 확인해야 할 것(문서에 없는 A 또는 C 후보) 75개.
- ERD 도구는 "추정 관계(점선, 근거 표시, 사람 확정)" 개념이 필요하다. MDM 에서도 FK 53개가 있음에도 의도적으로 FK 를 안 건 논리 참조가 12행 이상 있다.

## 1. 정답 집합: MDMAPUSER FK
SQL (J/fk.sql):
```
select x from (select c.table_name||'|'||cc.column_name||'|'||p.table_name||'|'||pc.column_name||'|'||cc.position||'|'||c.constraint_name x
 from user_constraints c join user_cons_columns cc on cc.constraint_name=c.constraint_name
 join user_constraints p on p.constraint_name=c.r_constraint_name
 join user_cons_columns pc on pc.constraint_name=p.constraint_name and pc.position=cc.position
 where c.constraint_type='R') order by 1;
```
결과: J/mdm_fk.txt = 62행(칼럼 쌍). 제약 53개(복합 FK 포함), 서로 다른 (자식,부모) 표 쌍 51개. 표 39개(PK 있는 표 39, flyway 제외). MCMAPUSER 는 FK 0행(J/mcm_fk.txt 빈 파일), 표 55(PK 있는 표 52, PK 없는 표 3: TB_MCM_CODE_CATEGORY/CODE_DETAIL/CODE_MASTER).
FK 의 특성(설계가 FK 를 의식한 스키마라 A 에 유리한 상한선):
- 부모 칼럼 이름이 PK(단일)와 같은 경우가 대부분. 단 복합 FK 가 많음(MARU_CODE_ID+FROM_VER → TB_MDM_CODE_VER(MARU_CODE_ID,VER) 등, 버전 칼럼 이름이 FROM_VER 로 달라짐).
- 부모가 PK 가 아니라 UNIQUE 를 참조하는 FK: TB_MDM_LAYOUT_ITEM.COLUMN_PHYS → TB_MDM_COLUMN.PHYS_NAME(UX_..._PHYS_NAME), TB_MDM_LAYOUT_CONST → TB_MDM_LAYOUT_HEADER(LAYOUT_ID,VER,HEADER_LAYOUT_ID)(UX_TB_MDM_LAYOUT_HEADER_HDR). J/mdm_uk.txt.

## 2. 방법 A — 칼럼명 규칙 (J/methodA.mjs)
규칙: 표 P 의 PK 칼럼과 같은 이름 칼럼을 가진 다른 표 C → C.col → P.col 후보.
 - single-pk: P 의 PK 가 한 칼럼이면 C 에 같은 이름 칼럼만 있으면 됨(PK 칼럼 이름이 'ID' 한 단어면 제외).
 - composite-full: P 의 PK 가 복합이면 C 가 그 PK 칼럼 전부를 가질 때(칼럼마다 후보 1개 생성).
 - 변형: x = 감사·버전 칼럼 제외, y = x + 감사 VER 와 PK 의 VER 구분 + 같은 칼럼의 다중 부모 중 이름 접두어 최장 부모만 유지, P = 복합 PK 부분일치(식별자성 칼럼 *_ID/_CODE/_CD), S = 접미 규칙(자식 칼럼이 _<부모PK>로 끝남), F = 표 이름 접두어(같은 3토큰 계열) 필터.
 - 제외 목록(AUDIT): C_USR_ID C_SVC_ID C_PGM_ID C_AT U_USR_ID U_SVC_ID U_PGM_ID U_AT VER ROW_VERSION. 필요 여부: "같은 이름 칼럼이면 무조건"(naive) 규칙은 MDM 에서 후보 13,868칼럼쌍/표쌍 1,412(정밀도 0.00)·MCM 에서 18,504칼럼쌍으로 폭발한다(감사 9칼럼이 모든 표에 있음: MCM 46표). 그러므로 PK 기준으로 시작하는 것 자체가 필수 제외 규칙 역할을 하고, 그 위에서 감사 칼럼 제외는 PK 에 VER 가 섞인 표(MDM 의 버전 표)에서만 의미가 있다.
MDM 정답 대비(표 쌍 = 자식·부모 쌍, 방향 무시 아님 아래는 정확 일치):

| 변형 | 후보 칼럼쌍 | 정밀도(칼럼) | 재현율(칼럼) | 후보 표쌍 | 정밀도(표쌍) | 재현율(표쌍) | MCM 후보 칼럼쌍/표쌍 |
|---|---|---|---|---|---|---|---|
| naive(동명 칼럼) | 13868 | 0.00 | 0.74 | 1412 | 0.04 | 0.98 | 18504 / 2124 |
| x (PK 기준+감사 제외) | 101 | 0.43 | 0.69 | 70 | 0.57 | 0.78 | 112 / 99 |
| xP (+복합 부분일치) | 150 | 0.29 | 0.71 | 114 | 0.36 | 0.80 | 156 / 136 |
| xPS (+접미) | 153 | 0.30 | 0.74 | 115 | 0.37 | 0.82 | 163 / 140 |
| xy (+VER·다중부모 정리) | 58 | 0.59 | 0.55 | 52 | 0.67 | 0.69 | 82 / 76 |
| xyS | 61 | 0.59 | 0.58 | 53 | 0.68 | 0.71 | 89 / 80 |
| xyF (+표 접두어) | 41 | 0.56 | 0.37 | 35 | 0.69 | 0.47 | 61 / 55 |
(정답 칼럼쌍 62, 표쌍 51. "표쌍" 열의 재현율/정밀도는 mdm_fk 의 (자식>부모) 일치.)
해석:
- 표 이름 접두어 필터(F)는 재현율을 크게 깎는다(0.78→0.47): FK 가 TB_MDM_CODE_* → TB_MDM_SYSTEM, TB_MDM_DOMAIN → TB_MDM_UNIT 처럼 계열을 가로지른다. 쓰지 않는 편이 낫고, 대신 "점수" 가산(같은 계열이면 +)으로 쓰는 것이 합리적.
- 접미 규칙(S)은 재현율을 +0.04 올리지만(PARENT_DOMAIN_ID→DOMAIN_ID 등 2~3개), MCM 에서 PK 이름이 짧으면 폭발(최초 구현에서 PK 'ID' 때문에 907개) → 'ID' 단독 PK 제외·'_' 포함 PK 만으로 제한하면 163.
- 다중 부모 정리(y)는 정밀도를 올리나 진짜 FK 도 지운다(TB_MDM_CODE_ITEM 은 CODE 와 CODE_VER 둘 다 정답인데 y 가 하나만 남김). 자동 삭제 말고 "점수 낮춤+표시"로 쓰는 것이 낫다.
- 미탐(x 기준 FN 18칼럼쌍) 원인: 이름이 다른 참조 15쌍 — SOURCE_SYSTEM·SND_SYSTEM·RCV_SYSTEM → SYSTEM_CODE(8), FROM_VER → VER(3), PARENT_DOMAIN_ID → DOMAIN_ID, HEADER_LAYOUT_ID → LAYOUT_ID(2~3), TRANS_UNIT → UNIT_CODE, COLUMN_PHYS → PHYS_NAME(UNIQUE) — 나머지는 UNIQUE 를 참조하는 복합 FK(LAYOUT_CONST). 즉 "접미/접두 수식어 + 부모 PK 이름" 규칙(…_SYSTEM→SYSTEM_CODE 는 안 잡힘)과 UNIQUE 키까지 부모 후보로 삼는 확장이 필요하다. 자세한 목록: J/mdmA_x_FN.txt.
- 오탐(x 기준 FP 57칼럼쌍) 원인: (a) 형제·하위 표가 같은 PK 이름을 공유(RECV_ID 가 CODE_RECV/DATA_RECV/RULE_RECV 모두 PK → 서로를 부모로 오판, CATE_ID 등) (b) 버전 표 이중 부모(TB_MDM_CODE 와 TB_MDM_CODE_VER 모두 MARU_CODE_ID 단일/복합) (c) PK 의 VER·SEQ 가 감사 VER 와 겹침 (d) **의도적으로 FK 를 안 건 논리 참조**: TB_MDM_CODE_CATE_ITEM → CODE_CATE/CODE_ITEM, TB_MDM_DATA_CATE_ITEM → DATA_CATE/DATA_ITEM(12행) — decisions F12/F13 "선분 참조라 FK 아님, 앱이 검사". 이것들은 관계로는 맞고 DB 제약만 없다. 전체 목록: J/mdmA_x_FP.txt.
- 가장 큰 구조적 문제: "허브" 칼럼. MCM 에서 USER_ID 는 부모 후보가 8개(TB_MCM_SEC_USER, TB_SEC_USER, TB_MCM_SEC_USER_PWD, 복합 PK 포함표들), MENU_ID 3, TRANSACTION_CODE 3. 후보 있는 자식 칼럼 62개 중 26개(42%)가 부모 후보 2개 이상이고 그 칼럼들이 후보 76개를 만든다. (J/union.mjs 출력)

### MCM 에 적용 (J/mcmA_x.csv, 변형 x)
- 후보 112행 (칼럼쌍) → 표 쌍 94(방향 무시 정규화)·99(방향 포함). 규칙별: single-pk 88, composite-full 24.
- 예시 20개 (자식.칼럼 → 부모.칼럼):
1. TB_MCM_SEC_USER.DEPT_CD → TB_MCM_DEPT_INFO.DEPT_CD
2. TB_SEC_SCREEN_USAGE_DAY.DEPT_CD → TB_MCM_DEPT_INFO.DEPT_CD
3. TB_MCM_JOB_RUN.JOB_ID → TB_MCM_JOB_DEF.JOB_ID
4. TB_MCM_JOB_COLLECT_DATA.JOB_ID → TB_MCM_JOB_DEF.JOB_ID
5. TB_MCM_MOM_FORMAT_LAYOUT.(FORMAT_ID,FORMAT_VER) → TB_MCM_MOM_FORMAT_LIST (복합)
6. TB_MCM_MOM_TC_SEND.(INTERFACE_ID,TRANSACTION_CODE) → TB_MCM_MOM_INTERFACES (복합)
7. TB_MCM_MOM_TC_ERROR.TRANSACTION_CODE → TB_MCM_MOM_TC_LIST.TRANSACTION_CODE
8. TB_MCM_NOTICE_TARGET.NOTICE_ID → TB_MCM_NOTICE.NOTICE_ID
9. TB_MCM_SEC_MENU.OBJECT_ID → TB_MCM_SEC_OBJ.OBJECT_ID
10. TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID → TB_MCM_SEC_PERM.PERMISSION_ID
11. TB_MCM_SEC_ROLE_MAPPING.ROLE_ID → TB_MCM_SEC_ROLE.ROLE_ID
12. TB_MCM_SEC_USER_MAPPING.ROLE_GROUP_ID → TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID
13. TB_MCM_SEC_USER_FAVORITE.(USER_ID,FVT_FOLD_ID) → TB_MCM_SEC_USER_FAVORITE_FOLD (복합)
14. TB_MCM_SEC_USER_WIDGET.(USER_ID,TAB_ID) → TB_MCM_SEC_USER_WIDGET_TAB (복합)
15. TB_MCM_WIDGET_DEFAULT_TAB_ITEM.(LAYOUT_KEY,TAB_ID) → TB_MCM_WIDGET_DEFAULT_TAB (복합)
16. TB_MCM_SEC_USER_WIDGET.WIDGET_ID → TB_MCM_WIDGET_DEF.WIDGET_ID
17. TB_SEC_CODE_ITEM.GROUP_CD → TB_SEC_CODE_GROUP.GROUP_CD
18. TB_MCM_SEC_USER_HIS.USER_ID → TB_MCM_SEC_USER.USER_ID (참; 그러나 같은 USER_ID 가 TB_SEC_USER 와 TB_MCM_SEC_USER_PWD 로도 후보)
19. TB_MCM_SEC_USER.USER_ID → TB_MCM_SEC_USER_PWD.USER_ID (방향 오류 의심: 1:1 표라 어느 쪽이 부모인지 이름만으로 못 정함)
20. TB_MCM_SEC_ROLE.MENU_ID → TB_MCM_SEC_MENU_FLD.MENU_ID (문서 dbml 에는 있으나 이 쪽은 FLD 와 MENU 두 표 PK 가 모두 MENU_ID 라 둘 다 후보)

## 3. 방법 B — JPA 엔티티
명령 (src/backend, 테스트·build 제외):
- `@Entity` 클래스 수: aps-core 1, cactus-core 6, caravan-console 4, caravan-core 3, mcm 4, mcm-core 49, mdm 33, mls 2, mpn 2, mpp 2, mqc 2 = 108. (@Table 어노테이션 96개 — 나머지는 상속·다른 방식).
- @ManyToOne/@OneToMany/@OneToOne/@ManyToMany/@JoinColumn/@MapsId 실제 어노테이션 = **0건**(모든 모듈, 테스트 제외). 주석에 이름이 나오는 것은 mdm MdmUnit.java:15·MdmDomain.java:15 (금지 설명) 뿐.
- 복합 키 어노테이션: @IdClass 42, @EmbeddedId 9, @Embeddable 9 (주로 mdm/lib/.../entity/*Id.java). 키 구조만 알려주고 관계는 주지 않음(DB 의 PK 와 중복).
- 이유(정책): MES 모듈은 JPA 연관관계 매핑 금지. 근거: docs/guide/BackEnd/Backend-Implementation-Guide.md:44, docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md:267 (§6 금지 사항 "JPA 연관관계 매핑(@OneToMany, @ManyToOne 등) 사용"), docs/mdm/tasks/TSK-06-01/design.md:296 (불변 규칙 16 "엔티티는 JPA 연관관계를 쓰지 않는다(원시 ID 필드)"), 그리고 ArchUnit 시험 mdm/lib/src/test/java/com/dongkuk/dmes/mdm/entity/MdmEntityArchitectureTest.java:40-56 가 ManyToOne/OneToMany/OneToOne/ManyToMany 를 빌드에서 막는다. docs/mcm/erd/csa-menu-erd.md:23 도 "mcm-core 엔티티에 @ManyToOne/@OneToMany/@JoinColumn 이 0건 (JPA 연관관계 금지 정책)" 이라 적음.
- 결론: 엔티티는 관계 근거가 아니다(= 전부 ID 칼럼만 든 패턴, 100%). 얻을 수 있는 것은 엔티티 ↔ 표 이름 매핑(@Table)과 칼럼 정의뿐이고, ERD 도구가 DB 를 읽으면 이미 알고 있는 정보다. 관계 개수 기여 0.

## 4. 방법 C — SQL 조인 (J/methodC.mjs, J/methodC_pairs.csv)
대상: src/backend 아래 .java/.xml/.sql/.bpmn 2,234개 파일(test·build·archive·node_modules 제외). SQL 이 어디 있나:
- MyBatis mapper XML 은 8개뿐(cactus-core DmomMapper.xml, caravan-hub 등). 대부분의 SQL 은 Java 문자열: @Query/네이티브 쿼리/JdbcTemplate 사용 파일이 mcm-core 61, mdm 38, mcm 6 등. BPMN 268개 중 SQL 포함 16개.
- 방식: Java 는 멤버(4칸 들여쓰기) 단위로 쪼개고 `a.X = b.Y` 를 찾음. 표 별칭은 `FROM|JOIN|UPDATE|INTO|USING|, TB_xxx [AS] 별칭` 로 해석, JPQL 은 @Entity/@Table/@Column 을 읽어 엔티티명→표, 필드→칼럼으로 변환(엔티티 95개 매핑).
- 결과: SQL 성격의 동치식 138개, 별칭 해석 성공 77개(56%) → 서로 다른 (표.칼럼 = 표.칼럼) 쌍 44개, 그중 자기조인 제외 33개(MDM 11, MCM 계열 21, 기타 1). 해석 실패의 주 원인: CTE/서브쿼리/MERGE USING (SELECT … FROM DUAL) 의 별칭(child/parent/T/S 등), 딕셔너리 뷰 조회(DbViewerService.java, MasterRuleColListRepository.java 의 ALL_CONS_COLUMNS 조인), 표 이름이 상수라서 문자열에 TB_ 가 안 보이는 경우. 이 한계는 "정규식+별칭 수준"에서 풀리지 않고 SQL 파서가 필요하다(확인 안 됨: 파서 도입 시 개선폭 미측정).
- 상위 30개 쌍 (파일 수/등장 수 순; J/methodC_pairs.csv 전체):
  3f TB_MDM_DATA_ITEM.MARU_DATA_ID = 자기 자신 (자기조인), 3f TB_MDM_DATA_ITEM.CODE = 자기 자신,
  2f TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID = TB_MCM_SEC_USER_MAPPING.ROLE_GROUP_ID,
  2f TB_MDM_LAYOUT.LAYOUT_ID = TB_MDM_LAYOUT_VER.LAYOUT_ID, 2f TB_MDM_LAYOUT_ITEM.LAYOUT_ID = TB_MDM_LAYOUT_VER.LAYOUT_ID, 2f TB_MDM_LAYOUT_ITEM.VER = TB_MDM_LAYOUT_VER.VER,
  1f TB_MCM_SEC_ROLE.ROLE_ID = TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID (5x), TB_MCM_NOTICE.NOTICE_ID = TB_MCM_NOTICE_TARGET.NOTICE_ID, TB_MCM_SEC_MENU.OBJECT_ID = TB_MCM_SEC_OBJ.OBJECT_ID,
  TB_CARAVAN_HUB_CONFIG.TOPIC_ID = TB_CARAVAN_TOPICS.TOPIC_ID, TB_MCM_DEPT_INFO.DEPT_CD = TB_MCM_SEC_USER.DEPT_CD, TB_MCM_MOM_FORMAT_LIST.ID = TB_MCM_MOM_INTERFACES.FORMAT_ID(칼럼 이름이 다른 참조!),
  TB_MCM_SEC_PERM.PERMISSION_ID = TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID, TB_MDM_RULE.MARU_RULE_ID = TB_MDM_RULE_VER.MARU_RULE_ID, TB_MDM_RULE_SET.MARU_RULE_SET_ID = TB_MDM_RULE_SET_VER.MARU_RULE_SET_ID,
  TB_MCM_MOM_FORMAT_LIST.FORMAT_ID = TB_MCM_MOM_TC_LIST.FORMAT_ID, TB_MCA_RULE_COL_LIST.RULE_ID = TB_MCA_RULE_MASTER.RULE_ID, TB_MCM_MOM_TC_ERROR.SQ_VAL = TB_MCM_MOM_TC_SEND.ERR_SQ_VAL(이름 다른 참조),
  TB_MCM_MOM_TC_ERROR.TRANSACTION_CODE = TB_MCM_MOM_TC_LIST.TRANSACTION_CODE, TB_MCM_MOM_TC_LIST.TRANSACTION_CODE = TB_MCM_MOM_TC_SKIP.TRANSACTION_CODE, TB_MCM_SEC_ROLE.ROLE_ID = TB_MCM_SEC_ROLE_MAPPING.ROLE_ID,
  TB_MCM_SEC_MENU.OBJECT_ID = TB_MCM_SEC_ROLE_MAPPING.OBJECT_ID, TB_MCM_CODE_CATEGORY.MASTER_CODE = TB_MCM_CODE_MASTER.MASTER_CODE, TB_MCM_CODE_DETAIL.MASTER_CODE = TB_MCM_CODE_MASTER.MASTER_CODE.
  (상위 30개 대부분이 1파일 1회라 빈도 순위는 변별력이 낮음; 30번째까지 가면 빈도 1.)
- MDM 정답 대비(J/evalC.mjs): 자기조인 제외 MDM 쌍 11개 → 정답 칼럼쌍과 일치 10개 → 정밀도 0.91, 재현율 10/62 = 0.16. 표 쌍 기준 8개 중 7개 정답 → 정밀도 0.88, 재현율 7/51 = 0.14. 오탐 1개는 TB_MDM_LAYOUT.LAYOUT_ID = TB_MDM_LAYOUT_ITEM.LAYOUT_ID (FK 는 LAYOUT_VER 를 거침; 조인은 건너뜀).
- MCM: 자기조인 제외 칼럼쌍 21, 표쌍 19. 이름이 다른 참조(FORMAT_LIST.ID = INTERFACES.FORMAT_ID, TC_ERROR.SQ_VAL = TC_SEND.ERR_SQ_VAL)를 잡아내는 점과, DB 에 PK 가 없는 레거시 표(TB_MCM_CODE_*)·다른 스키마(TB_MCA_*)를 잡는 점이 A 에 없는 장점.
- 한계: SQL 은 "실제로 조인한 것"만 나온다. 약한 관계라도 조인한 것은 높은 확신. 조인 안 한 관계는 영원히 안 나옴(재현율 0.14).

## 5. 방법 D — MDM 컬럼 사전 (SELECT, J/d*.sql 실행 결과)
- TB_MDM_COLUMN 7,951행, 도메인 158개 사용. REF_KIND 컬럼: NULL 7,950 / 'MASTER' 1 (REF_TARGET='CUST', PHYS_NAME=CUST_CD 한 건). REF_CATE_ID 사용 0.
- TB_MDM_DOMAIN 171개 중 DOMAIN_KIND: QTY 86, TEXT 35, CODE 18, ID 18, DATE 8, FLAG 6. CODE 종류 도메인 18개 중 MARU_CODE_ID(마스터 코드 연결)를 가진 것은 3개, 그 도메인을 쓰는 칼럼은 3개.
- TERM_IDS: 7,951행 전부 값이 있다([1250, 571, 1405, 6] 같은 용어 ID 배열) = 칼럼명 구성 용어이며 "코드 참조" 정보가 아니다.
- 사전은 표 단위가 아니라 물리명 하나로 전역(TB_MDM_COLUMN.PHYS_NAME UNIQUE) → "어느 표의 칼럼인지" 정보 없음 = 관계 복원의 근거로는 부적합. MDM 자신의 칼럼 이름 213개 중 사전에 있는 것은 35개(16%), MCM 칼럼 이름 296개 중 42개(14%): 대부분 사전에 없다. FK 자식 칼럼 이름 21개 중 사전에서 ID 종류 6, TEXT 1, 없음 14.
- 쓸 수 있는 점은 칼럼 "분류"뿐: 도메인 종류가 ID/CODE 인 칼럼은 FK 자식 후보로 가중치를 줄 수 있으나(MCM 이름 중 ID 18·CODE 7), 정답 FK 자식 칼럼의 대부분이 사전에 없어 재현율을 올리지 못한다. D 의 관계 기여: ≈0 (CUST_CD→CUST 1건, 대상이 마스터 코드/업무 마스터라 표 FK 가 아님).
- 기록: 같은 사전의 TB_MDM_COLUMN_SYSTEM 은 시스템별 물리명 별칭(관계 아님).

## 6. 방법 E (추가 발견) — 사람이 쓴 논리 FK 문서
- docs/mcm/erd/csa-menu.dbml: `Ref:` 27줄, docs/mcm/erd/notice.dbml: 2줄 = 29관계, 24표 (J/evalDbml.mjs 로 파싱). docs/mcm/erd/csa-menu-erd.md:23-24 "물리 FK 제약이 하나도 없다. … 아래 관계선은 전부 논리 FK". csa-sec-erd.md 도 있음.
- 이 29개를 MCM 부분 정답으로 평가: 방법 A(x)는 해당 24표 안에서 후보 47 → 적중 27, 정밀도 0.57·재현율 0.93 (놓친 2개: TB_MCM_SEC_MENU_FLD 자기참조 PARENT_MENU_ID→MENU_ID, TB_MCM_SEC_USER_WIDGET_MEMO.DEF_ID→TB_MCM_WIDGET_DEF.WIDGET_ID = 이름이 다른 참조). 방법 C: 후보 9 → 적중 8, 정밀도 0.89, 재현율 0.28.
- 이 문서는 MCM 56표 중 24표만 덮음. MDM 은 docs/mdm/erd/*.mmd(mermaid) 가 있음(02~06)이나 DB 에 FK 가 이미 있어 별도 평가 안 함.
- 기존 도구: DbViewerService(Java)가 이미 USER_CONSTRAINTS/ALL_CONS_COLUMNS 를 읽는다(위치 확인 안 됨: 경로는 grep 으로 파일명만 확인).

## 7. 합산 (MCM, 표 쌍 기준, 방향 무시 정규화; J/union.mjs)
| 항목 | 수 |
|---|---|
| A (x) | 94 |
| C | 19 |
| 문서(dbml) | 29 |
| A∩C | 11 |
| A∩문서 | 27 |
| C∩문서 | 8 |
| 세 방법 모두 | 8 |
| A만 | 64 |
| C만 | 8 |
| 문서만 | 2 |
| A∪C | 102 |
| A∪C∪문서 | 104 |
| 사람 확인 필요 (A 또는 C 이면서 문서에 없음) | 75 |
- B(JPA) 0, D(사전) ≈0 이라 합산에 기여 없음.
- 관계가 하나라도 걸리는 표: 56표 중 49. 고립(관계 없음) 7: SAMPLE_MASTER_CODE, SAMPLE_NOTICE, TB_MCM_JOB_HANDLER, TB_MCM_WIDGET_MEDIA, TB_SEC_AUDIT_LOG, TB_SEC_KEY_STORE, flyway_schema_history.
- 사람이 확인할 양 추정: A 후보 94 중 문서로 검증된 27을 빼면 67, C 만 8, 합 75개. 이 가운데 허브 칼럼(USER_ID, MENU_ID, TRANSACTION_CODE 등) 때문에 생긴 다중 부모 후보가 약 76개 에지 중 상당수 — 허브 규칙(같은 칼럼명이 부모 후보 2+ 이면 "가장 이름이 가까운 표 1개를 점선, 나머지는 숨김/접힘")을 넣으면 실제 확인 대상은 약 40~50개로 줄 것으로 추정(확인 안 됨: 시험 안 함). 문서가 덮은 24표는 사실상 확정 후보.
- 정답이 없는 MCM 전체에 대한 실제 정밀도는 확인 안 됨. 추정치: MDM 표쌍 정밀도 0.57~0.68, 문서 부분 0.57 → MCM 후보의 대략 55~65% 가 실관계.

## 8. FK 정책 확인
결론: **DB FK 자체를 금지하는 규칙은 찾지 못했다. 금지는 "JPA 연관관계 매핑"이고, MDM 은 오히려 DB FK 를 적극 건다. MES 모듈의 DB FK 부재는 정책이라기보다 이력(사실상의 관행)으로 보이며 명시 근거는 확인 안 됨.**
- JPA 연관관계 금지(명시): standard-v2 02 §6 (02-structure-naming-constraints.md:267), Backend-Implementation-Guide.md:44, MdmEntityArchitectureTest.java:40-56, TSK-06-01/design.md:296.
- MDM: FK 는 설계 요구. docs/mdm/naming-dialect-rules.md:17(FK 이름 규칙 FK_{테이블}_{참조…}), adr/0001 D1, docs/mdm/tasks/TSK-02-03/design.md:116(“원장 내부 FK·인덱스·CHECK, 하위 업무 테이블로의 FK 금지 확인”), decisions.md:281~282/465~467(교차 FK 를 후행 추가), adr/0003-module-boundary-screens-roles.md:34 (“MDM 과 mcm 은 서로의 테이블을 읽거나 쓰지 않는다. 모듈 사이 FK·JOIN·뷰가 없다” = 모듈 간 FK 금지).
- 의도적으로 FK 를 안 거는 자리(MDM, 앱이 검사): TB_MDM_CODE_CATE_ITEM/TB_MDM_DATA_CATE_ITEM → CATE·ITEM(선분 참조, valid_from 이 행마다 달라 FK 불가) — design.md TSK-02-03:131 F12·469-470·577-578, TSK-07-01:30(F13), TSK-06-01:148·287. TB_MDM_RULE_SET.RULE_IDS 는 FK 없음(원천 명시, TSK-02-03/design.md:745). 이들은 ArchUnit/마이그레이션 시험으로 "FK 가 없음"을 고정한다.
- MCM: src/backend/mcm-core 의 flyway 파일(12개)과 mls/mpp/mqc/mpn/aps-core 마이그레이션에서 FOREIGN KEY·REFERENCES 문 grep 결과 0건(FK 있는 migration SQL 은 mdm Oracle V1 baseline 하나). docs/mcm/erd/csa-menu-erd.md:23 이 "물리 FK 제약이 하나도 없다 … 논리 FK" 라고 *관찰*만 적음. RULE.md·CLAUDE.md·docs/guide 에서 "MCM 에 DB FK 를 걸지 마라" 형태의 명시 규칙은 검색에 안 잡힘(검색 패턴: FK|외래|foreign, 물리 FK, 논리 FK 등).
- 가이드 산재: docs/guide/Database/oracle-26ai-test-guide.md:294 는 SQLite→Oracle 이전에서 CHECK·FK 를 "옮기지 않음(보고만)" 으로 둔다(이전 도구 규칙, 정책 아님).
- 의미: ERD 도구에 "FK 가 DB 에 없는 것이 정상인 스키마" 가 있다는 전제가 맞고, 이후 MCM 에 FK 를 실제로 추가하는 것은 금지가 아니라 미결정 사안(확인 안 됨: 사용자·아키텍트 정책).

## 9. ERD 도구 설계에 주는 시사점
1. "확정 관계(DB FK)"와 "추정 관계(점선)"를 구분하는 모델이 필수. MCM 은 FK 0개이므로 추정 관계를 안 그리면 관계선이 하나도 없는 ERD 가 된다. MDM 도 정답 FK 53 외에 의도적 논리 참조(CATE_ITEM→CATE/ITEM)가 있다.
2. 관계 레코드: {자식표.칼럼[], 부모표.칼럼[], 상태(DB확정/추정/사람확정/기각), 근거[](PK명 일치, SQL 조인 파일:줄, 문서, 사람), 신뢰 점수}. 근거 표시는 툴팁으로 파일·줄까지.
3. 후보 생성기 순서(수확 대비 비용): ① DB FK(있으면) ② 사람 문서(dbml/mermaid 가져오기, 이미 29건) ③ SQL 조인(정밀도 높음, 재현율 낮음, 이름 다른 참조를 잡음) ④ 칼럼명 규칙(PK 이름 기준, 허브 처리, UNIQUE 키 포함). JPA 엔티티는 쓸모 없음(연관 0). 컬럼 사전은 가중치용 보조(ID/CODE 칼럼 표시)뿐.
4. 허브 칼럼 처리(USER_ID 부모 후보 8개): 한 칼럼에 부모 여러 개면 가장 이름이 가까운 표 하나만 점선으로, 나머지는 접힌 "다른 후보 n개"로.
5. 사람 확정 기록은 모델에 저장(재가져오기 때도 유지). 화면은 "확정/기각" 두 클릭, 표 단위 일괄 확정(문서가 덮는 24표).
6. 방향 오류(1:1 표 SEC_USER ↔ SEC_USER_PWD, MENU_FLD ↔ MENU)와 UNIQUE 참조(COLUMN_PHYS→PHYS_NAME) 대응: 부모 후보에 UNIQUE 키 포함, 방향은 "PK 가 단일이고 자식 PK 가 부모 PK 를 포함하면 자식"으로 판정하고 모호하면 사람에게.
7. 확인 안 된 것: SQL 파서 도입 효과, 허브 규칙의 실제 오탐 감소, 운영 DB 에서의 정밀도(로컬 L_MAIN 기준), MCM 전체 정밀도.
