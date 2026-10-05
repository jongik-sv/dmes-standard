# scripts/mdm-meta — 화면 키 컬럼 사전 등록·확인 도구

머리글 툴팁이 붙도록 화면 키를 MDM 컬럼 사전에 등록하고, 등록 전후 mcm 메타 hit 수를 비교하는 도구다.
분류 근거는 [docs/mdm-column-dict/classification.md](../../docs/mdm-column-dict/classification.md) 에 있다.

| 파일 | 하는 일 |
|---|---|
| `collect-keys.mjs` | m-mcm·m-mls·m-mdm 화면이 메타를 찾는 키를 모은다(`--names` 물리명 목록, `--json` 위치 포함). |
| `check-meta.sh` | 키 목록으로 `/api/{module}/mdmMeta/columns` 를 불러 hit·missing·unavailable 수를 낸다. `--baseline`·`--expect` 로 전후 비교. 읽기 전용. |
| `columns-2026-10-05.json` | 등록 묶음 — 용어 1(위젯), 새 표준 컬럼 60(MES 별칭 60), 기존 컬럼 별칭 10. |
| `register-columns.mjs` | 등록 묶음을 MDM OASIS `termMng`·`columnMng` 로 보낸다. 기본 dry-run, `--apply` 일 때만 save. 묶음의 `descriptions` 구역은 기존 컬럼의 설명만 바꾼다(§3). |
| `columns-widget-2026-10-05.json` | 위젯 관리 화면 칸 설명 묶음 — 용어 1(비공개), 새 표준 컬럼 15(위젯 전용 이름), 기존 위젯 전용 컬럼 4개 설명 갱신. |
| `keys-2026-10-05.txt` | 2026-10-05 화면 키 고정 목록(메타를 요청하는 물리명 416개, dev d1028256 합친 뒤). 전후 비교는 늘 이 목록으로 한다. |
| `baseline-2026-10-05.json` | 등록 전 mcm 응답(hit 61·missing 355, 로컬 2026-10-05). |
| `expected-gain-2026-10-05.txt` | 등록과 C1b 뒤 hit 돼야 할 키 147개(분류 NEW 70·ALIAS 10·MDM 67). |
| `derive-lists.sh` | 분류표·고정 키 목록에서 기대 hit 목록과 측정 이름 목록(`scripts/perf/mdm-meta/names-*.txt`)을 다시 만든다. |

## 1. 표준관리자 인증

컬럼 저장(`columnMng` save)은 서비스가 요청 역할에 `MDM_STD_ADMIN` 이 있는지 직접 본다(`MdmStdAdminGuard.requireStdAdmin`). SYSADMIN·admin 계정만으로는 거부된다(MDM016).

MDM BE 를 BFF 없이 직접 부를 때 역할이 들어가는 길은 다음과 같다.

1. `X-Client-Key` — BE 의 `cactus.security.client-key`(환경변수 `BACKEND_CLIENT_KEY`)와 같아야 한다. 로컬 기본값은 `dmes-bff-local-client-key-2026` 이다.
2. cactus `ClientKeyFilter` 가 키를 확인한 뒤 `X-Authenticated-User`·`X-Authenticated-Role`(쉼표 목록, `ROLE_` 은 없으면 붙인다)로 사전 인증을 만든다.
3. `JwtAuthenticationFilter` 가 그 인증의 권한을 `UserContextHolder` 로 옮기고, `CactusMdmCurrentUser` 가 `ROLE_` 를 떼어 `MDM_STD_ADMIN` 으로 읽는다.

그래서 스크립트는 `X-Authenticated-Role: MDM_STD_ADMIN`(기본, `--role` 로 바꿈)과 `--user <표준관리자 사번>` 을 보낸다. 사번은 등록 행의 작성자(C_USR_ID)로 남으니 실제 표준관리자 사번을 쓴다.
2026-10-05 로컬에서 쓰기 없이 확인했다: 빈 save 요청에 역할 `USER` 는 MDM016, `MDM_STD_ADMIN` 은 가드를 지나 필수값 오류(MDM021)로 끝났다.

용어 저장(`termMng` save)은 서비스 가드가 없고 BFF 액션 권한만 본다. BE 를 직접 부르면 같은 헤더로 저장된다.

## 2. 실행 순서

등록은 피드 기록이 남는 OASIS save 로만 한다. SQL·Flyway 로 넣으면 메타 기록(META_REV)이 안 남아 업무 모듈 캐시가 모른다.

1. **배포 순서**: C1b(시스템 코드 목록)가 든 MDM WAS 를 먼저 올리고, 그 뒤 `cactus.mdm.system-code: MES,MDM` 이 든 mcm 을 올린다. 반대로 하면 옛 MDM 이 `"MES,MDM"` 을 코드 하나로 보고 MES 별칭까지 모두 없음으로 답하고, 그 없음이 mcm 캐시에 남는다. 순서가 어긋났으면 mcm 캐시 관리 화면(mdmCacheMng)에서 다시 읽기를 한다.
2. **확인(dry-run)**: 읽기만 한다. 항목마다 `PLAN`(할 일)·`SKIP`(이미 있음)·`FAIL`(막힘)을 낸다.
   ```bash
   node scripts/mdm-meta/register-columns.mjs --base http://localhost:8096
   ```
   2026-10-05 로컬 결과: PLAN 71·SKIP 0·FAIL 0. `WIDGET_ID` 는 용어 「위젯」 이 아직 없어 「용어 등록 뒤 가능」 으로 나오는데, `--apply` 한 번에 용어를 먼저 저장하므로 같은 실행에서 이어 저장된다. 이 항목은 dry-run 에서 도메인·별칭·중복 검사를 건너뛰므로 적용 결과로 확인한다.
3. **적용**: 용어 → 새 컬럼 → 기존 컬럼 별칭 순서로 저장한다.
   ```bash
   node scripts/mdm-meta/register-columns.mjs --base http://localhost:8096 --user <표준관리자 사번> --apply
   ```
4. **확인**: mcm 캐시가 10초 주기로 기록을 읽는다. 10초 넘게 기다린 뒤 비교한다.
   ```bash
   scripts/mdm-meta/check-meta.sh --names scripts/mdm-meta/keys-2026-10-05.txt \
     --baseline scripts/mdm-meta/baseline-2026-10-05.json --expect scripts/mdm-meta/expected-gain-2026-10-05.txt
   ```
   기대값: `gained=147 lost=0`, `not_yet=0`(exit 0). `lost` 가 있거나 `not_yet` 이 남으면 exit 1 이다. 그 키의 분류 행과 등록 결과를 대조한다.
   mcm 메타 조회는 mcm 캐시에 있음·없음을 채운다. 배포 순서가 어긋난 상태(1번)에서는 돌리지 않는다.

## 3. 스크립트 동작

- **멱등**: 다시 돌려도 된다. 용어는 (표기, 의미 번호)가 있으면 건너뛴다. 새 컬럼은 같은 표준 물리명이 있으면 별칭만 맞추고, 별칭이 모두 있으면 건너뛴다. save 는 실패하면 통째로 롤백되므로 중간 실패 뒤 다시 돌리면 남은 것만 시도한다.
- **같은 물리명의 다른 컬럼 보호**: 기존 컬럼에 별칭을 붙일 때 논리명이 묶음의 `columnName` 과 다르면 `FAIL` 로 둔다.
- **운영 DB 대비**: 용어·도메인은 ID 대신 이름으로 적었다. 새 컬럼마다 실행 시점에 대상 서버에서 논리명을 FORWARD 분해해, 표준 물리명과 용어(표기#의미 번호)가 묶음과 같을 때만 저장하고 그 서버의 용어 ID 를 쓴다. 다르면 `FAIL` 로 건너뛴다. 도메인은 추천 목록에서 같은 이름을 고른다. 없으면 dry-run·`--apply` 모두 `FAIL` 로 막는다(`--allow-no-domain` 이면 비우고 저장한다. 한 번 비운 도메인은 다시 돌려도 채워지지 않는다).
- **기존 컬럼 별칭 추가**: `columnMng` save 는 필드 전체를 덮어쓰고 시스템 매핑을 차분으로 저장한다(빠진 매핑은 지운다). 그래서 스크립트는 상세(view)의 필드·용어·매핑을 그대로 다시 보내고 별칭만 더한다. 용어가 비거나 빠진 컬럼(빈 용어로 보내면 서버가 논리명을 다시 분해해 채운다)과, save 가 받지 않는 시스템(자기 시스템 MDM, `SELF_YN='Y'`) 매핑이 있는 컬럼은 다시 저장할 수 없어 `FAIL` 로 둔다. 그래서 CD_V·COLUMN_ID 에 붙일 `CODE_VAL`·`COL_ID` 는 묶음에서 빼고 화면 meta 로 연결했다.
- **알려진 한계**: view 와 save 사이(1초 미만)에 다른 관리자가 같은 컬럼을 고치면 그 변경을 덮는다(save 에 낙관적 잠금이 없다). 공용 DB 에서는 등록하는 동안 사전 편집을 멈춘다.
- **별칭 충돌**: 같은 시스템·이름(대소문자 무시)의 별칭이 다른 컬럼에 있으면 서버가 거부한다. 미리 REVERSE 분해 중복(입력 그대로·대문자 이름)으로 확인해 `FAIL` 로 알린다. 섞인 대소문자로 저장된 별칭은 미리 못 잡고 save 가 거부한다.
- **기존 컬럼 설명 갱신(`descriptions`)**: 묶음 `descriptions` 항목(`physName`·`columnName`·`description`)마다 상세(view)의 필드·용어·매핑을 그대로 다시 보내고 `description` 만 바꾼다. 논리명이 묶음과 다르거나, 용어가 빠졌거나, save 가 받지 않는 시스템 매핑이 있으면 `FAIL` 로 둔다. dry-run 의 `PLAN` 줄에 「전: … → 후: …」 로 앞뒤 설명을 80자까지 보여 준다. 설명이 이미 같으면 `SKIP` 이다. 범용 이름(TITLE·KIND·USE_YN·CATEGORY 등)은 다른 화면이 같이 쓰므로 이 구역에 넣지 않는다.
- 실패가 하나라도 있으면 exit 1. 서버에 닿지 못하면(연결 거부·30초 초과) 그 자리에서 멈춘다. 출력은 탭 구분 `상태 종류 이름 설명` 한 줄씩이고 요약은 stderr 로 낸다.

## 4. 인자

| 인자 | 기본 | 뜻 |
|---|---|---|
| `--file` | `columns-2026-10-05.json` | 등록 묶음 |
| `--base` | `http://localhost:8096` | MDM BE 주소 |
| `--client-key` | 환경변수 `BACKEND_CLIENT_KEY`, 없으면 로컬 기본값 | `X-Client-Key` |
| `--user` | 없음(`--apply` 에 필수) | `X-Authenticated-User` — 표준관리자 사번 |
| `--role` | `MDM_STD_ADMIN` | `X-Authenticated-Role` |
| `--only` | `terms,columns,aliases,descriptions` | 일부만 돌린다(순서는 늘 용어 → 컬럼 → 별칭) |
| `--allow-no-domain` | 끔 | 추천에서 도메인을 못 찾은 새 컬럼도 도메인 없이 저장한다 |
| `--apply` | 끔 | 실제로 저장한다 |
