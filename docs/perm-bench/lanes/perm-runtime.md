# perm-runtime 레인 메모

- 브랜치 `perm/perm-runtime` · 워크트리 `C:/Users/jongik.jang/project/dmes-perm-runtime` · 기준 6dfcf8c3c
- 정본 지시 = `~/.coord/perm-bench/lanes/perm-runtime/brief.md`(지시 perm-runtime-1)

## 할 일

| id | 내용 | 상태 |
|---|---|---|
| r0 | 지금 규칙 특성 시험(UserPermCache·SecUserService) | 끝 |
| r1 | DefaultPermResolver·DefaultImpactCalculator + 사례 시험(applyChanges 는 c1 것) | 끝(머지 d06ddda7c) |
| r2 | V2PermGraphLoader·LegacyPermGraphLoader + `mcm.security.perm-model` + loadForRoles | 끝(리뷰 반영) |
| r3 | 런타임 전환 + 로그인 키 빌드 시간 측정 | 끝(측정·리뷰 반영, r5 와 묶어 머지 요청) |
| r4 | PermExplainService(explain·사람·역할 메뉴 트리, CUR/DRAFT) | 끝(리뷰 반영) |
| r5 | PermExplainParityOraTest + searchMenuTree vs getMyMenus(조정자 지시) | 끝(r3 와 묶어 머지 요청) |

## 결정

- 조정자 답(2026-11-27): END_ACTIVE_DATE = 자정이면 그날 끝까지, 시각 있으면 그 시각까지(r1 구현 그대로) · UserImpact LinkedHashSet 변경 = perm-core c9 · bench-be 역할 단위 REASON = NO_PERM 하나, 역할 단위 설명 API 없음
- r2 추가 몫: `PermGraphLoader.loadForRoles(Set<String>)` 구현(perm-core 가 계약에 더함) · PermGraphLoader 빈은 `mcm.security.perm-model` 로 하나만 등록(bench-be NoUniqueBean 방지)
- 결정 11(조정자, 2026-11-27): perm-bench-be apply 는 RoleChangedEvent 를 커밋 뒤(@TransactionalEventListener AFTER_COMMIT) 발행한다. r3 의 UserPermCache 무효화 구독은 이 전제로 맞춘다
- D35(조정자, 2026-11-27): v2 resolver 는 역할·그룹·오브젝트의 USE_TP=N·유효 기간 밖을 뺀다. 끄기 속성은 따로 두지 않는다(되돌림 = `perm-model=legacy`). r5 는 이 차이를 「의도된 차이」로 따로 적는다.

## r0 에서 고정한 지금 규칙(legacy)

- 역할·그룹 = 매핑 ID 만 따라간다. USE_TP·유효 기간을 보지 않는다(엔티티 저장소가 의존성에 없음)
- 오브젝트·퍼미션 USE_TP·유효 기간 = 보지 않는다
- 메뉴 = SEC_MENU USE_TP='Y' + 역할 매핑에 OBJECT_ID 있음. 퍼미션 토큰 내용은 보지 않는다(빈 퍼미션도 메뉴 보임)
- 숨김 메뉴(MENU_VIEW_YN='N') = 빼지 않고 `hiddenYn='Y'`
- 폴더 = USE_TP='N' 빼기 + 보이는 leaf 조상만
- 키 = `lower(trim(SYSTEM_CODE) ?: mcm)/lower(OBJECT_ID)/lower(action)`, 토큰 = 네 칸 합집합·trim·빈 값 제거
- 없는 오브젝트·퍼미션 매핑 = 건너뜀
- SYSADMIN 특례 = freepass=true 일 때만. 키 캐시·메뉴는 역할 ID(SYSADMIN·ROLE_SYSADMIN)로, 버튼은 권한 문자열(hasAuthority)로만 판정 — 둘이 다르다
- 버튼 목록 = 매핑 줄마다 토큰, 줄 사이 중복 안 지움, objId 대소문자 유지

시험: `UserPermCacheCurrentRuleTest`(12)·`SecUserServiceCurrentRuleTest`(12)

## r1 초안 진행(2026-11-27, 미커밋)

- 계약 스텁 = `BE/security/perm/*.java`(PermTokens·PermGraph·PermChange·DenyReason·GrantReason·ButtonVerdict·Explain·PermResolver·UserImpact·ImpactCalculator). **untracked, 커밋 금지.** 머리 주석 `LOCAL STUB`. c1 이 들어오면 지우고 실제 계약에 맞춘다
- 스텁 PermGraph 모양(추측): userGroups·groupRoles(Map<String,Set>)·roles(RoleMeta)·groups(GroupMeta)·objects(ObjMeta: systemCode·useTp·기간·btnPerm·popupPerm List)·rolePerms(roleId→objectId→RolePerm)·menus(MenuMeta: menuId·parent·objectId·menuViewYn·useTp). `applyChanges` → `impl.PermGraphChanges.apply` 위임
- 작성됨: `impl/PermEvaluator.java`(그래프×시각 계산, 역할별 효과 메모), `impl/DefaultPermResolver.java`(@Component, Clock 주입, explain 이유 판정)
- 아직: `impl/PermGraphChanges.java`(applyChanges), `impl/DefaultImpactCalculator.java`, 사례 시험 `BT/security/perm/impl/*Test.java`, 컴파일 확인, opus 리뷰 1회

### r1 설계 판단(초안)

- 활성 = USE_TP≠'N' 이고 시작 ≤ 지금 ≤ 끝(빈 쪽은 열림). 그룹·역할 메타가 그래프에 없으면 쓰는 것으로 본다. 오브젝트 메타가 없으면 빠진다(옛 규칙: 없는 오브젝트 매핑 건너뜀)
- SYSADMIN = 역할 ID `SYSADMIN`·`ROLE_SYSADMIN`. 역할 자체 사용 여부는 본다
- visibleObjects = 퍼미션 행이 있는 쓰는 오브젝트(효과가 비어도). actionsOf = 효과가 빈 오브젝트는 뺀다
- 숨김 메뉴 = 게이트·키에 영향 없음(옛 규칙 hiddenYn 과 같음). explain 의 menuReason 에만 MENU_HIDDEN
- 거절 이유 우선순위 = NOT_IN_OBJ(퍼미션엔 있고 오브젝트에 없음) → OBJ_UNUSED → ROLE_UNUSED → GROUP_UNUSED → NO_ROLE → NO_PERM
- 허가 이유 = 퍼미션 경로가 하나라도 있으면 PERM, SYSADMIN 경로만이면 SYSADMIN
- applyChanges 계획: 순서대로 적용, UPD 의 null 칸 = 그대로, ADD 의 null = 빈 목록, 모르는 tp·op = IllegalArgumentException
- ImpactCalculator 계획: 두 그래프에 계산기를 하나씩 두고 사람 합집합 × 오브젝트 gained·lost, userId·objectId 순

## r1 상태(재개 지점)

- c1(tip 1c263a0f5) 위로 rebase 끝. 스텁 지움. wip c6c5d179d = 실제 계약 맞춤, impl 시험 30건·r0 24건 통과
- 계약과 다르게 가정했던 곳(c1 이 정본, 맞춤 끝): 레코드가 최상위 타입 · USE_TP≠Y = 사용 안 함(null·빈 값 포함) · `ButtonVerdict.Kind` enum, grantReason·denyReason 둘로 나뉨 · `Explain.objectReason`·`paths(ExplainPath)` · `MenuNode.visible` boolean · applyChanges 는 c1 `PermGraph` 안(모르는 tp·op 무시, UPD = 덮어쓰기) → `impl/PermGraphChanges` 지움, 그 시험도 뺌
- 새 판단: paths = 쓰는 그룹→쓰는 역할 중 행이 있는(또는 SYSADMIN) 경로, 토큰 = 효과 값(SYSADMIN = obj BTN·POPUP 전부). 오브젝트를 가리키는 메뉴가 그래프에 없으면 visible(팝업 오브젝트·메뉴 없는 로드)
- opus 리뷰 1회 반영(꼭 고칠 것 0): 끝 값 자정 = 그날 끝까지 포함(질문 보냄, 기본안) · explain 메뉴 표시 = 조상 폴더까지 표시·사용 중 · SYSADMIN 효과는 objects 맵 키 기준·null 값 건너뜀 · null RolePerm = 행 없음 · NO_ROLE = 연결된 역할이 없을 때만(모두 사용 안 함이면 NO_PERM) · 그룹·역할 둘 다 꺼지면 ROLE_UNUSED · SYSADMIN 경로의 행 토큰은 거절 버튼으로 안 보임
- 영향 계산 = action 차이만 센다. 효과가 빈 행 추가·삭제(보임만 바뀜)는 줄이 없다 → b3 쪽 화면 수 계산은 visibleObjects 로 따로 봐야 한다
- 계약 요청(perm-core c9 로 지시됨): `UserImpact` 의 `Set.copyOf` 는 순서가 JVM 마다 달라진다 → `unmodifiableSet(new LinkedHashSet<>(..))` 요청. 그전까지 소비 쪽이 정렬
- impl 시험 40건 통과 · mcm-core 전체 시험(-Pdmes.ora.test=clone -Pdmes.ora.template=TPL_SCHEMA, 이 PC 에 TPL_EMPTY 없음) 통과

## r2 진행(2026-11-27)

- `load/AbstractPermGraphLoader`(공통: 사람·그룹·역할·메타·메뉴, 범위 좁히기, IN 900개 나눔, EntityManager 네이티브 쿼리) + `V2PermGraphLoader` + `LegacyPermGraphLoader`. 기존 repository 는 손대지 않는다(D27 perm-core 소유)
- 범위: loadForUsers = 사람·그룹·역할·퍼미션만 좁히고 objects·menus 는 전체(조정자 지시). loadForRoles = 그 역할이 든 그룹의 사람 전부 + 사람 없는 역할의 메타·행. 계약에 loadForRoles 가 들어오면 @Override 를 단다
- 메뉴 = SEC_MENU_FLD(폴더) + SEC_MENU(화면). visible = MENU_VIEW_YN≠N
- legacy: (역할, 오브젝트) = 행 하나, BTN = COMMON ∪ CUSTOM ∪ ACTION, POPUP = POPUP_BTN(D11). 오브젝트 허용 값 = 그 오브젝트의 옛 줄 전체 합집합(교집합이 옛 계산과 같도록). 퍼미션 USE_TP 는 보지 않는다. 읽을 때마다 옛 줄 전체를 한 번 읽는다(되돌림 전용이라 감수)
- 빈: `@ConditionalOnProperty(mcm.security.perm-model)` v2(기본·값 없음)·legacy. 값은 대소문자를 가리지 않고, 모르는 값이면 로더가 없어 기동이 실패한다. `mcm/api/application.yml` 에 `perm-model: v2` 한 줄
- 시험: `PermGraphLoaderOraTest`(8, clone) · `PermModelBeanSelectionTest`(6)
- 리뷰 반영: legacy = 역할·그룹·오브젝트 USE_TP·유효 기간을 「쓰는 중」으로 싣는다(옛 동작, `keepUsage()=false`) · 없는 퍼미션 줄도 (역할, 오브젝트) 행(토큰 없음, 메뉴 보임) · SEC_PERM 한 번 + 좁은 매핑 읽기 · 공백 SYSTEM_CODE = null · null 범위 = 빈 범위
- 조정자 답: 초안 영향 = loadAll(b3), loadForRoles = 역할 메뉴 트리(CUR)용만. 임시 `load/RoleScopedPermGraphLoader` 는 c9 머지 뒤 지운다
- r3 몫으로 남김: v2 loadForUsers 는 로그인마다 OBJ·MENU_FLD·MENU 전체 읽기 → legacy 와 시간 비교, 필요하면 objects·menus 스냅숏 캐시(RoleChangedEvent AFTER_COMMIT 무효화)

## r4 진행(2026-11-27)

- `security/perm/PermExplainService`(@Service, readOnly): explain · userMenuTree · roleMenuTree. 인자 draft = 변경 목록(null·빈 = CUR). 초안 저장·읽기는 작업대 몫
- 범위: CUR 사람 = loadForUsers, CUR 역할 = loadForRoles, DRAFT = loadAll().applyChanges
- 메뉴 트리 = `SecUserService.getMyMenus` 를 그대로 옮김: 화면 줄(USE_TP=Y)끼리 부모 타기 → 보이는 화면의 부모부터 폴더 줄끼리 부모 타기 → 폴더 USE_TP≠N. 폴더·화면 구분 = 읽은 표(MenuLabel.folder). hidden = 줄 자신의 MENU_VIEW_YN(SHOW_TP)
- 역할 트리 = 가상 사용자·그룹(#ROLE_PROBE_USER#) → 그 역할. 이유는 resolver explain 이 고른다. 모르는 역할 = NO_ROLE
- explain 의 MENU_HIDDEN 도 줄 자신만 본다(조상 폴더 안 봄)로 바꿨다(r1 리뷰 때 조상까지 보게 했던 것을 되돌림) — 트리·런타임과 같은 답
- 줄 이유: 폴더 USE_TP=N·화면 USE_TP≠Y·숨김 줄 = MENU_HIDDEN(enum 이 계약이라 따로 두지 않음, 호출 쪽은 useTp·hidden 칸으로 구분)
- 시험 `PermExplainServiceTest`(9)

## 성능 머지(2026-11-27, 조정자 지시 — r3 와 따로)

- 측정(bench-be): 1,000명·오브젝트 1,004·역할 1건 = 8,048ms → 목표 2초
- `DefaultPermResolver`: 최근 그래프 8개까지 계산기 재사용(그래프 동일성 ==, 같은 초, 약한 참조). 기준 시각 = 초 단위로 자름
- `PermEvaluator`: 메모 = 동시 맵. 조합 메모는 두지 않는다(조합이 모두 다르면 메모리만 잡음). actionsOf = 한 역할만 주는 오브젝트는 그 역할의 집합을 그대로 쓴다. visibleObjects = 키만 합친다
- `DefaultImpactCalculator`: 역할마다 바뀐 오브젝트를 한 번 구하고 (전 조합, 후 조합) 쌍마다 후보 오브젝트만 비교
- `DefaultPermResolver.activeRolesOf(graph, userId)` 공개 = 쓰는 역할 ID 정렬(bench-be 가 사람 묶기에 씀, 규칙 사본 제거용)
- actionsOf·visibleObjects 결과 순서는 바뀌었다(Set 계약이라 허용)
- 임시 `load/RoleScopedPermGraphLoader` 지움(계약 `PermGraphLoader.loadForRoles` default 가 들어옴)
- 시험 `PermPerfCaseTest`: 최악(모두 다른 역할 조합) 단독 470ms, 모듈 전체와 같이 1,253ms(두 번 재어 짧은 쪽) · 단순 계산과 전체 결과 같음

## r3 진행(2026-11-27, 재개 지점)

- 통합 tip = 1de1d7806(성능 머지까지). 브랜치 = tip + wip 1개(47c9b3254, r3 코드·시험)
- `UserPermCache`·`SecUserService`: 기존 생성자 = legacy 경로 그대로(시험·되돌림). 새 `@Autowired` 생성자 = `@Value perm-model`(기본 v2) + PermGraphLoader + PermResolver. v2 일 때만 로더·resolver 를 잡고, 아니면 null → 옛 코드
  - `UserPermCache.build` → v2 면 `buildV2`: loadForUsers({user}) → actionsOf → PermKey(lower(trim(SYSTEM_CODE) ?: mcm), oasis, lower(trim(OBJECT_ID)), action). action 은 PermKey 가 소문자로
  - `SecUserService.getMyButtonEndpoints` → v2 면 오브젝트마다 효과 action 한 줄씩(줄 사이 중복 없음, objId 원래 대소문자)
  - `filterMenusByRole` → v2 면 allowedObjectIds = visibleObjects. freepass 검사·조상 규칙은 그대로
  - 옛 표 저장소(roleMapping·permRepo·objRepo)는 v2 에서 부르지 않는다
- 바뀌지 않는 것(조정자): 사용자 USE_TP·유효 기간은 런타임이 보지 않는다(막는 곳 = 로그인). RoleChangedEvent 는 발행 쪽이 AFTER_COMMIT → 구독(@EventListener invalidateAll)은 그대로
- 시험: `perm/impl/RuntimeV2SwitchTest`(5) 새로 · r0 특성 시험 24건은 legacy 생성자로 그대로 통과 · mcm-core 전체 clone 1684건 통과
- 남은 r3 일: ① 로그인 키 빌드 시간 legacy vs v2(사용자 3명: SYSADMIN·MDM_STEWARD·일반, clone PDB 에 V21 데이터 필요 — TPL_SCHEMA 는 빈 표라 시드 방법 확인) ② opus 리뷰 1회·반영 ③ squash → 머지 요청
- 성능 메모(r3 측정 때 같이 볼 것): v2 loadForUsers 는 로그인마다 OBJ·MENU_FLD·MENU 전체를 읽는다. 느리면 로더 안 objects·menus 스냅숏 캐시(RoleChangedEvent·오브젝트·메뉴 저장 때 무효화)

## r3 마무리(2026-11-27)

- 측정 `load/LoginKeyBuildTimeOraTest`(clone, 합성 데이터: 오브젝트 1,000·폴더 50·메뉴 1,000·다른 사용자 2,000, 옛 표와 새 표에 같은 권한). V21 은 빈 표에 돌아 데이터가 없어 합성으로 넣었다. 두 경로 키 같음 확인
  - 중앙값(ms) legacy → v2: SYSADMIN(키 6,000) 77.9 → 32.3 · MDM_STEWARD(2,400) 63.5 → 26.7 · 일반(180) 14.4 → 21.8
  - v2 는 사람과 상관없이 OBJ·MENU_FLD·MENU 전체 읽기로 약 20ms 고정 비용. 작은 사용자는 7ms 느려지고 큰 사용자는 절반 → 스냅숏 캐시는 지금 두지 않는다(필요하면 MenuCatalog 스냅숏 재사용 검토)
- opus 리뷰(꼭 고칠 것 0) 반영: `filterMenusByRole` v2 에도 freepass DB 역할 검사(legacy 와 같게) · `loadAndCache` 전역 synchronized → 사람 단위 잠금 + 무효화 세대(빌드 중 무효화면 캐시에 안 넣음) · 측정 시험 OBJECTS ≤ 1,000 주석(legacy findAllById IN 한계)
- 그대로 둔 것: `getMyPermissions` 는 옛 SecRoleMapping 줄을 그대로 낸다(소비처 없음, 지시 범위 밖) · 모르는 perm-model 값 = 로더 빈 없음으로 기동 실패(r2 결정)
- 시험 `RuntimeV2SwitchTest` 7(+2: freepass DB 역할 메뉴, 무효화 뒤 다시 빌드)

## r5 진행(2026-11-27)

- `security/perm/PermExplainParityOraTest`(clone, 3건): ① explain 허가 버튼 == UserPermCache v2 키 ② userMenuTree 보이는 줄·숨김 == getMyMenus v2 ③ v2 ↔ legacy 런타임 키·화면 메뉴·버튼 차이 = D35·SYSADMIN 만, 분류 안 된 차이 0(목록 `build/perm-parity/r5-diff.txt`, 78줄)
- bench-be `searchMenuTree` 는 아직 통합 브랜치에 없다 → userMenuTree 를 그대로 내린다는 전제로 ② 가 대조를 맡는다
- 비활성 사용자: mcm-core 로더·런타임은 사용자 USE_TP 를 안 본다 → 여기서 차이가 나지 않는다. bench-be explain NO_ROLE 은 그 레인 시험 몫

## 남은 일

- r3: 위 ①②③
- r5: PermExplainParityOraTest(explain == UserPermCache 키, 표본 SYSADMIN·MDM_STEWARD·일반) + bench-be searchMenuTree vs getMyMenus(조정자 지시). 의도된 차이 = D35(사용 안 함 역할·그룹·오브젝트), 비활성 사용자(bench-be explain 은 NO_ROLE, 런타임은 안 봄), SYSADMIN(D13)
- 커밋 = `git -c user.name=jongik-sv -c user.email=<기존 커밋 메일>`, rebase 는 GIT_COMMITTER_NAME/EMAIL 환경 변수. Oracle 시험 = heavy --oracle --detach + `-Pdmes.ora.test=clone -Pdmes.ora.template=TPL_SCHEMA`(이 PC 에 TPL_EMPTY 없음), job id 는 `HEAVY_DETACHED id=` 만 잘라 쓴다
- 파일 수정은 Python 으로 할 때 바이트로 읽어 CRLF→LF 로 바꾸고 `newline='
'` 으로 쓴다(텍스트 모드 쓰기가 
 을 만든 적 있음). bash heredoc 안 python 은 따옴표 때문에 깨질 수 있어 스크립트를 scratchpad 파일로 둔다
- `src/backend/NUL`(추적 안 됨, 출처 모름) = 사용자 판단 대기
