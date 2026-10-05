# scripts/mdm-meta — 화면 키 컬럼 사전 등록·확인 도구

머리글 툴팁이 붙도록 화면 키를 MDM 컬럼 사전에 등록하고, 등록 전후 mcm 메타 hit 수를 비교하는 도구다.
분류 근거는 [docs/mdm-column-dict/classification.md](../../docs/mdm-column-dict/classification.md) 에 있다.

| 파일 | 하는 일 |
|---|---|
| `collect-keys.mjs` | m-mcm·m-mls·m-mdm 화면이 메타를 찾는 키를 모은다(`--names` 물리명 목록, `--json` 위치 포함). |
| `check-meta.sh` | 키 목록으로 `/api/{module}/mdmMeta/columns` 를 불러 hit·missing 수를 낸다. `--baseline`·`--expect` 로 전후 비교. 읽기 전용. |
| `columns-2026-10-05.json` | 등록 묶음 — 용어 1(위젯), 새 표준 컬럼 59(MES 별칭 59), 기존 컬럼 별칭 12. |
| `register-columns.mjs` | 등록 묶음을 MDM OASIS `termMng`·`columnMng` 로 보낸다. 기본 dry-run, `--apply` 일 때만 save. |
| `keys-2026-10-05.txt` | 2026-10-05 화면 키 고정 목록(물리명 417개). 전후 비교는 늘 이 목록으로 한다. |
| `baseline-2026-10-05.json` | 등록 전 mcm 응답(hit 62·missing 355, 로컬 2026-10-05 12시). |
| `expected-gain-2026-10-05.txt` | 등록과 C1b 뒤 hit 돼야 할 키 148개(분류 NEW 69·ALIAS 12·MDM 67). |

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
   2026-10-05 로컬 결과: PLAN 72·SKIP 0·FAIL 0. `WIDGET_ID` 는 용어 「위젯」 이 아직 없어 「용어 등록 뒤 가능」 으로 나오는데, `--apply` 한 번에 용어를 먼저 저장하므로 같은 실행에서 이어 저장된다.
3. **적용**: 용어 → 새 컬럼 → 기존 컬럼 별칭 순서로 저장한다.
   ```bash
   node scripts/mdm-meta/register-columns.mjs --base http://localhost:8096 --user <표준관리자 사번> --apply
   ```
4. **확인**: mcm 캐시가 10초 주기로 기록을 읽는다. 10초 넘게 기다린 뒤 비교한다.
   ```bash
   scripts/mdm-meta/check-meta.sh --names scripts/mdm-meta/keys-2026-10-05.txt \
     --baseline scripts/mdm-meta/baseline-2026-10-05.json --expect scripts/mdm-meta/expected-gain-2026-10-05.txt
   ```
   기대값: `gained=148 lost=0`, `not_yet=0`(exit 0). `not_yet` 이 남으면 그 키의 분류 행과 등록 결과를 대조한다.

## 3. 스크립트 동작

- **멱등**: 다시 돌려도 된다. 용어는 (표기, 의미 번호)가 있으면 건너뛴다. 새 컬럼은 같은 표준 물리명이 있으면 별칭만 맞추고, 별칭이 모두 있으면 건너뛴다.
- **운영 DB 대비**: 용어·도메인은 ID 대신 이름으로 적었다. 새 컬럼마다 실행 시점에 대상 서버에서 논리명을 FORWARD 분해해, 표준 물리명과 용어(표기#의미 번호)가 묶음과 같을 때만 저장하고 그 서버의 용어 ID 를 쓴다. 다르면 `FAIL` 로 건너뛴다. 도메인은 추천 목록에서 같은 이름을 고르고, 없으면 비우고 알린다(도메인은 필수가 아니다).
- **기존 컬럼 별칭 추가**: `columnMng` save 는 필드 전체를 덮어쓰고 시스템 매핑을 차분으로 저장한다(빠진 매핑은 지운다). 그래서 스크립트는 상세(view)의 필드·용어·매핑을 그대로 다시 보내고 별칭만 더한다. 용어가 빠진 컬럼은 다시 저장할 수 없어 `FAIL` 로 둔다.
- **별칭 충돌**: 같은 시스템·이름(대소문자 무시)의 별칭이 다른 컬럼에 있으면 서버가 거부하므로, 미리 REVERSE 분해 중복으로 확인해 `FAIL` 로 알린다.
- 실패가 하나라도 있으면 exit 1. 출력은 탭 구분 `상태 종류 이름 설명` 한 줄씩이고 요약은 stderr 로 낸다.

## 4. 인자

| 인자 | 기본 | 뜻 |
|---|---|---|
| `--file` | `columns-2026-10-05.json` | 등록 묶음 |
| `--base` | `http://localhost:8096` | MDM BE 주소 |
| `--client-key` | 환경변수 `BACKEND_CLIENT_KEY`, 없으면 로컬 기본값 | `X-Client-Key` |
| `--user` | 없음(`--apply` 에 필수) | `X-Authenticated-User` — 표준관리자 사번 |
| `--role` | `MDM_STD_ADMIN` | `X-Authenticated-Role` |
| `--only` | `terms,columns,aliases` | 일부만 돌린다 |
| `--apply` | 끔 | 실제로 저장한다 |
