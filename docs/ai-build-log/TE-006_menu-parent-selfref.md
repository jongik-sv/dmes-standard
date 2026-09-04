# TE-006 — 메뉴 등록 시 상위 폴더가 자기 자신이 되어 복구 불가가 되는 결함

- 일자: 2026-09-04
- 대상: `commMenuMng` (메뉴 관리) — `CommMenuMngService.saveCmMenu` / `page.tsx` handleSave
- 상태: 해결

## 증상

메뉴 관리에서 화면(leaf) 행을 추가·저장했는데:

- 트리에서 소속 폴더를 눌러도 **메뉴 목록 0건** — 방금 저장한 행이 안 보인다
- OBJECT 관리의 `MENU ID` 콤보에서 폴더를 골라 저장해도 반영이 안 된다
- OBJECT 검색 팝업에서 OBJECT 를 다시 고르면 상위 폴더가 **계속 자기 자신**으로 채워진다

DB 실측:

```
TB_MCM_SEC_MENU
  MENU_ID        = 'noticeMgmt'
  PARENT_MENU_ID = 'noticeMgmt'   ← 자기 자신 (있어야 할 값: 'lsh')
  OBJECT_ID      = 'noticeMgmt'
  USE_TP='Y' / MENU_VIEW_YN='Y'
```

## 원인 — 결함 3개가 겹쳤다

### ① 근본 원인: BE 가 빈 부모를 자기참조로 저장 (`CommMenuMngService:219`)

```java
String rowParentMenuId = strOf(row.get("PARENT_MENU_ID"));
entity.setParentMenuId(
        (rowParentMenuId != null && !rowParentMenuId.isBlank()) ? rowParentMenuId : menuId);
                                                              //  ↑ 비면 자기 자신
```

주석은 "blank 인 비정상 입력만 As-Is fallback(self) 로 보호" 라고 되어 있었으나, **보호가 아니라
복구 불가능한 행을 만들어 내는 fallback** 이었다.

As-Is(폴더·화면이 한 테이블) 시절의 `PARENT_MENU_ID = #{MENU_ID}` 자기참조를 보존한 것인데,
**R3(2026-06-02) 에서 폴더를 `TB_MCM_SEC_MENU_FLD` 로 분리한 뒤로는 자기참조가 성립할 수 없는 값**이다.
화면 leaf 의 부모는 언제나 그룹 폴더여야 한다.

### ② 유입 경로: FE 가 빈 값을 검증 없이 전송 (`page.tsx:824`)

```ts
PARENT_MENU_ID: selectedTreeMenuId ?? ""
```

행추가는 **선택된 트리 노드**를 부모로 넣는다. 트리에서 아무것도 고르지 않은 채 추가하면 빈 문자열이
그대로 전송된다. 저장 전 검증(V-002)은 `MENU_ID` / `MENU_SEQ` / `MENU_NM` / `OBJECT_ID` 4개만 봤고
`PARENT_MENU_ID` 는 보지 않았다.

### ③ 치명적 요인: 화면에서 되돌릴 수단이 없다

한 번 자기참조로 저장되면 화면 안에서 고칠 방법이 사라진다:

| 경로 | 왜 막히나 |
|---|---|
| 트리에서 폴더 선택 후 조회 | `searchCmMenu` 가 `PARENT_MENU_ID IN (후손 폴더)` 로 찾는데 자기 자신은 그 집합에 없다 → **0건** |
| 상세 폼의 상위 폴더 수정 | `page.tsx:1450` — `readOnly` |
| 메인 그리드에서 수정 | 메인 그리드에 `PARENT_MENU_ID` 컬럼이 없다 (`:1282` 의 편집 컬럼은 **폴더 그리드**) |
| OBJECT 검색 팝업으로 재설정 | `SecMenuNativeRepository:291` 이 부모를 **`SEC_MENU` 에서 역조회**한다 → 깨진 값을 계속 되읽는 순환 |
| OBJECT 관리에서 MENU ID 지정 | `TB_MCM_SEC_OBJ` 에 **`MENU_ID` 컬럼이 없다.** 화면의 MENU ID 는 `CommObjMngService:299` 가 조회 시 계산하는 **읽기 전용 파생값** |

즉 DB 를 직접 건드리지 않으면 빠져나올 수 없었다.

### 부수 피해: 화면도 안 열린다

조회가 됐더라도 못 연다. `SecUserService:403` 이 페이지 경로를 이렇게 만든다:

```java
row.put("componentPath", parentMenuId + "/" + objectId);
```

자기참조면 `noticeMgmt/noticeMgmt` 를 찾는데 `page-registry` 의 실제 키는 `lsh/noticeMgmt` 다.

## 해결

### BE — fallback 제거, 거부로 전환

```java
String rowParentMenuId = strOf(row.get("PARENT_MENU_ID"));
if (rowParentMenuId == null || rowParentMenuId.isBlank()) {
    throw new BusinessException(ErrorCode.REQUIRED_VALUE,
            "상위 폴더가 지정되지 않았습니다 (MENU_ID=" + menuId + "). "
                    + "좌측 메뉴 구조 트리에서 그룹 폴더를 먼저 선택한 뒤 행을 추가하세요.");
}
entity.setParentMenuId(rowParentMenuId);
```

메서드 javadoc 의 "자기참조 자동 세트" 서술도 함께 정정했다 — 코드와 어긋난 채 남아 있었다.

### FE — 저장 전 검증 2건 추가 (V-005)

- `PARENT_MENU_ID` 빈 값 차단 (원인인 "트리 미선택" 을 메시지로 직접 안내)
- 자기참조(`PARENT_MENU_ID === MENU_ID`) 차단 — 과거 데이터·수기 입력 방어

### 데이터

작업 중 사용자가 해당 행을 이미 삭제해 복구 UPDATE 는 0행이었다.
전 테이블 자기참조 잔존 행 검사 결과 **0건**.

## 검증

```
POST /mcm/oasis/commMenuMng/save   (PARENT_MENU_ID="")
→ HTTP 200 / success=false
→ "상위 폴더가 지정되지 않았습니다 (MENU_ID=tmpProbe). 좌측 메뉴 구조 트리에서
   그룹 폴더를 먼저 선택한 뒤 행을 추가하세요."
```

| 확인 | 결과 |
|---|---|
| 거부 메시지 | 의도대로 노출 |
| `tmpProbe` 행 적재 | **0건** — 트랜잭션 롤백 |
| 자기참조 행 | **0건** |
| `mcm-core` 컴파일 | BUILD SUCCESSFUL |
| `m-mcm` 타입체크 | 내 코드 오류 0 |

## 교훈

1. **"안전한 기본값" 이 사일런트 데이터 손상을 만든다.** 값이 없을 때 그럴듯한 값을 지어내는 fallback 은
   에러를 미루기만 한다. 특히 그 값이 **조회 조건에 쓰이는 키**라면, 잘못된 행은 화면에서 사라져
   사용자가 고칠 수도 없게 된다. 없으면 거부하는 편이 낫다.
2. **As-Is 동작 보존은 구조가 바뀌면 재검토해야 한다.** 자기참조는 폴더·화면이 한 테이블이던 시절엔
   말이 됐지만 R3 분리 후엔 성립하지 않는 값이다. "As-Is 보존" 주석이 붙어 있다고 그대로 두면 안 된다.
3. **읽기 전용 파생값을 입력 컨트롤로 그리지 말 것.** OBJECT 관리의 `MENU ID` 는 저장되지 않는데
   콤보박스로 그려져 있어, 사용자가 여기서 고치려다 시간을 썼다. 파생값은 텍스트로 표시해야 한다.
4. **역참조 LoV 는 오염을 증폭시킨다.** OBJECT LoV 가 부모를 `SEC_MENU` 에서 역조회하는 설계라,
   깨진 값이 팝업을 통해 계속 재주입됐다.

## 남은 개선 (미조치)

- **자가 복구 경로가 여전히 없다.** 상위 폴더가 잘못된 행은 아직도 화면에서 수정할 수 없다.
  메인 그리드에 `PARENT_MENU_ID` 편집 컬럼을 넣거나 상세 폼의 `readOnly` 를 푸는 방안 —
  화면 설계 변경이라 별건으로 분리했다.
- **OBJECT 관리의 `MENU ID` 콤보**를 읽기 전용 텍스트로 바꾸는 것 (교훈 3).
