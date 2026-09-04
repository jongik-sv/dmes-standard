# TE-007 — 역할·권한을 바꿔도 최대 10분간 반영되지 않던 결함 (RBAC 캐시 무효화 누락)

- 일자: 2026-09-04
- 대상: `commRoleMng` / `commRoleGrpMng` / `commUserMng` / `commUserRoleCopy` (csa 권한 4화면)
- 상태: 해결 (실기동 검증 완료)

## 증상

"권한을 줬는데 안 먹는다 / 뺐는데 아직 들어간다."

- 사용자관리에서 역할그룹을 붙이고 저장 → DB 에는 즉시 들어가고 **메뉴 트리에도 즉시 보이는데**,
  그 메뉴를 클릭하면 API 가 계속 **403**
- 반대로 역할을 회수해도 한동안 계속 통과
- 메뉴는 보이는데 클릭하면 막히는 **비대칭** 증상이라 원인 추정이 어렵다

## 원인

`UserPermCache` 는 TTL 10분이고, 즉시 무효화 경로는 `@EventListener onRoleChanged(RoleChangedEvent)`
**하나뿐**이다.

- `UserPermCache.java:60` — `TTL_MS = 10L * 60L * 1000L`
- `UserPermCache.java:151-154` — `onRoleChanged` → `invalidateAll()`

그런데 `RoleChangedEvent` 를 발행하는 곳이 저장소 전체에서 **`CommObjMngService.java:220` 단 한 곳**이었다.
정작 RBAC 체인을 바꾸는 네 화면은 아무도 발행하지 않았다 (해당 Service 에 `ApplicationEventPublisher`
주입 자체가 없었다).

`RoleChangedEvent.java:11-15` 의 javadoc 은 발행처로 "역할의 권한 매핑 변경 / 사용자-역할 매핑 변경 /
그룹 ↔ 역할·사용자 매핑 변경" 을 규정하고 있다. **문서가 규정한 발행처가 구현에서 통째로 누락된 상태**였다.

비대칭 증상의 이유는 소비처마다 신선도 모델이 다르기 때문이다:

| 소비처 | 근거 | 캐시 |
|---|---|---|
| 메뉴 트리 | `SecUserService.java:315 getMyMenus` | 없음 (DB 직독) → **즉시 반영** |
| 버튼 활성 | `SecUserService.java:472 getMyButtonEndpoints` | 없음 → 즉시 반영 |
| API 인가 | `UserPermCache.java:168 build` | **10분 TTL** → 최대 10분 지연 |
| BFF 게이팅 | `api-permission-cache.ts:28` | 60초 TTL (BE 를 백스톱으로 삼는 설계) |

BFF 는 애초에 "부여는 TTL(≤60초) 후 반영, 회수는 BE 가 즉시 차단" 을 전제로 설계돼 있는데
(`api-permission-cache.ts` 주석), 그 전제인 BE 즉시 차단이 성립하지 않고 있었다.

## 해결

RBAC 매핑을 바꾸는 네 지점에서 변경된 역할 ID 를 모아 `RoleChangedEvent` 를 발행한다.

- `CommRoleMngService.saveCmRoleMap` — 역할 ↔ OBJECT×PERMISSION (`touchedRoleIds` 직접 수집)
- `CommRoleGrpMngService.saveCmRoleGrpMap` — 역할그룹 ↔ 역할 (동일)
- `CommUserMngService.saveUserRoleGrp` / `saveUserRoleGrpCopy` — 사용자 ↔ 역할그룹
  (`publishRoleChanged(roleGroupIds)` 헬퍼가 `SecRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn`
  으로 역할 ID 로 환산)
- `CommUserRoleCopyService.save` — 동일 환산

발행 시점은 **INSERT/DELETE 를 모두 마친 뒤**다. 루프 앞에서 발행하면 무효화 직후 다른 요청이
옛 데이터로 캐시를 재적재해 다시 stale 이 된다.

부수로 `application-local.yml` 에 `mcm.bff.invalidate-role-url` 을 추가했다. 코드 기본값이
`localhost:3000` 인데 본 저장소의 포털(m-mcm)은 **5000** 이라, 권한을 바꿀 때마다
`BFF invalidate-role 호출 실패 (swallow)` WARN 만 남고 BFF 라우트 핸들러 캐시가 안 비워지고 있었다.

## 검증 (실기동)

역할 관리에서 `role_lsh_notic` 에 `TEST_NOTICE × masterCodeSelPop` 권한을 부여 → 회수,
역할 그룹 관리에서 `ROLE_GROUP_SYSADMIN` 에 `role_lsh_notic` 을 추가 → 제외.

```
15:49:04 [commRoleMng]    UserPermCache - [UserPermCache] 전체 무효화 — 1 사용자 캐시 제거   (권한 부여)
15:50:11 [commRoleMng]    UserPermCache - [UserPermCache] 전체 무효화 — 1 사용자 캐시 제거   (권한 회수)
15:51:44 [commRoleGrpMng] UserPermCache - [UserPermCache] 전체 무효화 — 1 사용자 캐시 제거   (역할 매핑 추가)
```

DB 도 매 단계 실측 확인했고, 검증 후 원래 상태로 되돌렸다.

## 교훈

- **이벤트 발행처가 javadoc 에만 있고 코드에 없는 경우가 있다.** 캐시를 도입할 때 "무효화 트리거를
  누가 쏘는가" 를 `grep` 한 번으로 확인해야 한다. 여기서는 구독처만 완성돼 있었다.
- **캐시 신선도 모델이 소비처마다 다르면 증상이 비대칭으로 나타난다.** "메뉴는 보이는데 403" 같은
  모순된 증상이 보이면, 같은 데이터를 읽는 경로가 여러 개이고 그중 일부만 캐시된 것을 의심한다.
- 로컬 개발계에서 `@Value` 기본값(포트 3000)이 실제 포트(5000)와 다른 채로 방치되면, 실패가
  swallow 되도록 설계된 코드에서는 WARN 만 남고 아무도 눈치채지 못한다.

## 정본 반영

- 발행처 4곳 코드에 `2026-09-04 fix` 주석으로 사유 명시
- `application-local.yml` 에 BFF 무효화 URL 명시 (주석에 3000/5000 불일치 사유 기재)
