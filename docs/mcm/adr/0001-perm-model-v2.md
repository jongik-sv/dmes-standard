# ADR-0001: 퍼미션 모델 v2 — 역할×오브젝트 퍼미션 한 건

- **Status**: PROPOSED
- **Date**: 2026-11-27
- **Decision Date**: —
- **Context Tags**: MCM, security, permission

## 쉬운 설명 (현업용 요약)

지금은 "어느 직무가 어느 화면에서 어떤 버튼을 쓸 수 있는가"를 세 곳에 나눠 적는다. 버튼 묶음 표, 직무와 화면과 묶음을 잇는 표, 화면 표다. 한 직무의 권한을 보려면 세 곳을 모두 열어야 한다. 시스템 관리자도 화면마다 줄을 만들어 주어야 새 화면이 열린다.

새 모델은 이를 단순하게 만든다.

- 직무와 화면 사이에 **퍼미션 한 건**을 둔다. 이 한 줄에 그 직무가 쓸 수 있는 버튼과 팝업을 적는다. 줄이 있으면 그 직무에게 화면이 보인다.
- 화면(오브젝트)은 **허용하는 버튼·팝업 목록**을 가진다. 직무가 실제로 쓰는 버튼은 직무 퍼미션과 화면 허용 목록이 겹치는 부분이다. 화면에서 버튼을 빼면 그 버튼은 즉시 모두에게 막힌다. 퍼미션 값은 남으므로 다시 넣으면 원래대로 돌아온다.
- 시스템 관리자는 줄 없이 모든 화면의 모든 버튼을 쓴다.
- 사용 안 함으로 둔 직무·직무 그룹·화면과 유효 기간이 지난 것은 권한 계산에서 빠진다. 지금 동작과 다른 점이며 의도한 변경이다.
- 옛 표는 지우지 않는다. 설정 한 줄로 옛 방식으로 되돌릴 수 있고, 새 계산과 옛 계산이 같을 때만 옛 표를 없앤다.
- 관리자는 권한 작업대에서 변경을 초안으로 모은다. 적용 전에 누가 권한을 얻고 잃는지 보고, 적용 결과는 이력에 남는다. 그 사이에 다른 관리자가 같은 범위를 고쳤으면 적용이 멈춘다.

## Context (배경)

- 현재 판정은 `TB_MCM_SEC_ROLE_MAPPING`(역할×오브젝트×묶음)과 `TB_MCM_SEC_PERM`(묶음의 COMMON·CUSTOM·ACTION·POPUP_BTN 칼럼)을 거친다. 한 직무의 권한 한 건이 여러 줄로 흩어진다.
- 게이트(`UserPermCache`)와 버튼 표시(`canDoButton`)는 이미 같은 토큰(action 이름)을 쓴다(D7).
- 묶음 `PERM_ALL` 은 약 120개 action 을 가진 공용 어휘이고, 시스템 관리자는 화면마다 `PERM_ALL` 매핑이 필요했다.
- 권한 작업대 시안(v16)은 사람·그룹·직무·메뉴를 한 화면에서 보고, 초안·영향·이력까지 요구한다.

## Decision (결정)

번호는 `docs/perm-bench/decompose.md` §1 의 결정 번호다. D31~D34 는 레인 운영 결정이라 이 ADR 의 범위 밖이다.

1. **퍼미션 한 건** — `TB_MCM_SEC_ROLE_PERM`(ROLE_ID, OBJECT_ID 복합 PK)에 `BTN_PERM`(필수)·`POPUP_PERM`·`DATA_PERM` 을 쉼표 목록으로 둔다(D9, D16). 퍼미션에는 사용 여부·유효 기간 칸이 없다. 버튼이 빈 퍼미션은 저장하지 않는다(D14).
2. **토큰 의미** — BTN 코드 = OASIS action 이름 = 버튼 `action` = 게이트 토큰(D7). POPUP 코드 = 그 오브젝트 안에서 팝업을 여는 action 코드이며 계산에서 BTN 과 합집합이다(D8). DATA_PERM 은 이번 회차에 칸 조회·저장만 하고 편집 화면이 없다(D21). 런타임 키 `module/objId/action` 은 그대로다(D26).
3. **오브젝트 허용 값 교집합** — `TB_MCM_SEC_OBJ` 에 `BTN_PERM`·`POPUP_PERM`·`DATA_PERM` 을 더한다. 역할×오브젝트 효과 = `(perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)`. 오브젝트에서 값을 빼도 퍼미션 값은 남고 계산에서만 빠진다. 퍼미션 저장은 오브젝트 허용 값 밖의 값을 거절한다(D15). 허용 값의 처음 채움은 묶음 토큰 합집합과 BPMN `actionGateway` 분기 이름이다. `PERM_ALL` 토큰은 오브젝트 action 목록과 겹치는 것만 쓴다(D12).
4. **SYSADMIN 행 없는 계산** — SYSADMIN 역할은 사용 중인 모든 오브젝트의 `(BTN ∪ POPUP)` 전부를 받는다. 퍼미션 행을 두지 않고, 옛 SYSADMIN 줄은 옮기지 않으며, `PERM_ALL` 시드와 SYSADMIN 자동 매핑을 중단한다(D13).
5. **사용 안 함·유효 기간 (D35)** — v2 계산은 역할·역할그룹·오브젝트의 `USE_TP=N` 과 유효 기간 밖인 것을 뺀다. 지금 런타임과 다른 의도된 변경이다. 옮긴 뒤 같은 사람에게 달라지는 권한이 생길 수 있으므로 대조 시험의 차이 목록에서 이 규칙으로 생기는 차이를 따로 표시한다.
6. **옛 표 공존·되돌리기 (D10, D19, D20)** — `TB_MCM_SEC_PERM`·`TB_MCM_SEC_ROLE_MAPPING` 은 지우지 않고 쓰기만 멈춘다. 새 표 이름은 옛 이름을 재사용하지 않는다(D9). 속성 `mcm.security.perm-model` 의 `v2`(기본)는 새 표를, `legacy` 는 옛 표를 읽는다. FK 에는 ON DELETE 를 두지 않는다. 마이그레이션은 V20(DDL)과 V21(데이터)이다. 옛 표를 지우는 V 파일은 운영 대조를 통과한 뒤 다음 회차에 낸다.
7. **계산의 단일 구현** — 판정·설명·영향·런타임 게이트는 같은 순수 함수 `PermResolver` 를 쓴다(D24). 캐시 무효화는 `RoleChangedEvent` 로 한다(D30).
8. **작업대 초안·지문 충돌·적용 이력** — 초안은 관리자마다 1건(`TB_MCM_SEC_PERM_DRAFT`)이다. 초안이 처음 건드린 범위(사람·그룹·역할)의 현재 행 지문(SHA-256)을 함께 저장하고, 적용 때 다시 계산해 다르면 `PERM_CONFLICT` 로 멈춘다(D22). 적용은 머리와 줄 두 표(`TB_MCM_SEC_PERM_HIS`, `TB_MCM_SEC_PERM_HIS_DTL`)에 남기고, 작업대 적용만 기록한다(D23).
9. **새 action 이름** — 코디네이터 결정 7·8 에 따라 새 OASIS action 을 해당 오브젝트의 `BTN_PERM` 기본값에 넣는다.

   | 오브젝트 | 새 action |
   |---|---|
   | `commObjMng` | `searchObjPerm`, `searchObjMenu` |
   | `commRoleMng` | `searchFolderObj`, `searchRoleGroups` |
   | `commPermMng` | `lov`, `searchPermOne` |

## Consequences (결과)

- 한 직무의 한 화면 권한이 한 줄이다. 직무별 퍼미션 조회·편집이 단순해진다.
- 새 화면을 만들 때 SYSADMIN 매핑을 따로 넣지 않는다. 대신 오브젝트 허용 값이 비어 있으면 SYSADMIN 도 그 화면에서 쓸 버튼이 없다. 허용 값 생성기가 찾지 못한 REST action 은 SYSADMIN 403 이 되므로 대조 시험과 실제 로그인 확인으로 보충 목록을 채운다.
- 오브젝트 `BTN_PERM` 이 1000자를 넘으면 생성기가 실패로 알린다(조용히 자르지 않는다).
- D35 때문에 옮긴 직후 일부 사용자의 권한이 지금과 달라질 수 있다. 사용 안 함이던 직무·그룹·화면에 매달린 권한이 사라지는 쪽이다.
- 새 표 4개와 OBJ 칼럼 3개가 생긴다. 칼럼 주석은 [column-comments-2026-11-27.md](../../db/column-comments-2026-11-27.md), ERD 는 [csa-sec-erd.md §8](../erd/csa-sec-erd.md) 에 있다.
- 마이그레이션 번호 V20 은 다른 브랜치의 V18·V19 가 먼저 들어가야 쓸 수 있다(D20, `outOfOrder=false`).
- 옛 표를 지우기 전까지 두 모델을 함께 유지하는 비용이 든다.

## Alternatives Considered (대안)

| 대안 | 기각 이유 |
|---|---|
| 옛 `TB_MCM_SEC_PERM` 이름을 새 구조로 덮어씀 | 옛·새 공존과 되돌리기가 불가능해진다(D9) |
| `PERMISSION_ACTION` 을 데이터 권한 후보로 보냄(시안 안) | ACTION 칸도 지금 게이트 토큰이다. 보내면 옮긴 뒤 버튼을 잃는다(D11) |
| 오브젝트 값을 뺄 때 퍼미션 값도 같이 지움 | 잘못 뺀 값을 복구하기 어렵다. 교집합으로 남기면 다시 넣을 때 원래대로 돌아온다(D15) |
| 퍼미션에 사용 여부·유효 기간 칸 추가 | 역할·오브젝트에 이미 있어 계산 경우만 늘어난다(D16) |
| 버튼 없는 퍼미션 허용 | "행 있음 = 메뉴 보임" 과 "버튼 없음" 이 충돌한다(D14) |
| 옛 화면 저장마다 버전 칼럼으로 충돌 검사 | 다른 브랜치가 고치는 파일을 건드리게 된다. 범위 지문으로 대체했다(D22) |
| SYSADMIN 에게도 퍼미션 행 부여 | 화면마다 행 관리가 남는다(D13) |

## Trigger (PROPOSED 인 경우만)

다음이 모두 충족되면 ACCEPTED 로 전환한다.

1. 사용자가 이 ADR 의 결정(특히 D35 와 옛 표 공존 기간)을 확정한다.
2. clone DB 에서 V20·V21 이 오류 없이 적용되고, 대조 시험 `PermModelParityOraTest` 의 legacy 대 v2 차이 목록이 D35 로 설명되는 차이만 남긴다.
3. 실제 로그인 확인(SYSADMIN·MDM_STEWARD·일반 사용자 3명)에서 메뉴·버튼·403 이 작업대 설명과 같다.
4. 적대적 검토(팀 에이전트)에서 확정된 결함이 반영된다.

## References

- [decompose.md](../../perm-bench/decompose.md) — 결정 D7~D30, 공용 계약 §0
- [perm-bench README](../../perm-bench/README.md) — 결정 D31~D34(레인 운영)
- `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V20__perm_model.sql`
- [칼럼 주석](../../db/column-comments-2026-11-27.md)
- [csa-sec-erd.md](../erd/csa-sec-erd.md) §8
