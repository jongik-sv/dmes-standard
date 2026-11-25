# 품질보증서 편집 — 화면·서버 계약

2026-11-25. 출력물관리 > 품질보증서관리(objectId `qualityCertificate`)를 목업 `~/Downloads/보증서 편집 시뮬레이터.html` 기준으로 새로 만든다. 기존 품질보증서관리 프로그램(발행 목록·발행 요청·처리 이력, `TB_MQC_QLTY_CERT`)은 지운다(사용자 선택: "기존 화면을 지우고 교체").

사용자 말: "다 목업이야. 실제로 깊이있게 구현할 필요없어. 다시 만들거니까." — 모양과 주요 흐름이 실제 저장과 함께 동작하는 수준으로 만든다.

## 1. 역할 나눔

| 할 일 | 맡는 곳 |
|---|---|
| 문서 편집(조항·블록, 기준값, 레이아웃, 양식 선택 규칙, 그림·서명), 종이 그리기, 쪽 나눔, 되돌리기·다시 실행, 찾기·바꾸기, 변경 전후 비교, 인쇄 | 화면(목업 이식) |
| 문서 본문 저장, 상태(적용본·초안·승인 대기), 승인 시 버전 올림과 버전 기록, 이력, 시연 초기화 | 서버(mqc OASIS 서비스 `qualityCertificate`) |

## 2. 문서 본문

목업의 상태 객체 `S`(DEF() 모양: brand, lang, grade, signer, clauses, order, vals, layout, assetImg, assetVer, sigImg, sigVer, sigH, showLogo, showMark, logoSize, headerSide, pinSign …)를 **불투명한 JSON 문자열**로 저장한다. 보기 전용 값(todo 체크, diffOn 같은 화면 상태)은 넣지 않아도 된다. 비교 기준(목업 `base`)은 서버가 승인 때 저장한 적용본 본문이다.

문서는 하나다(DOC_ID `MAIN`). 서버에 문서가 없으면 화면이 목업 `DEF()` 로 기본 문서를 만들어 `save`(act `INIT`)로 넣는다. 서명·그림 이미지는 본문 안의 data URL 로 들어간다.

## 3. OASIS 동작 — `POST /api/mqc/oasis/qualityCertificate/{action}`

params 에 배열·객체를 넣지 않는다. 본문은 문자열 파라미터 `json` 으로 보낸다.

| action | params | 하는 일 | result |
|---|---|---|---|
| `search` | 없음 | 현재 문서, 적용본, 버전 기록, 이력을 돌려준다 | `doc`: `{ ver, state, json, base, updatedAt, updatedBy }` 또는 null · `versions`: `[{ ver, memo, approvedAt, approvedBy }]`(ver 내림차순) · `hist`: `[{ at, act, msg, by }]`(최근 100건, 최근 먼저) |
| `save` | `json`, `state`(`APPLIED`·`DRAFT`·`PENDING`), `act`(`INIT`·`DRAFT`·`REQUEST`·`UNREQUEST`·`DISCARD`), `msg` | 현재 문서 저장. `INIT` 은 문서가 없을 때만 허용하고 적용본(base)과 v1 버전 기록도 같은 본문으로 만든다. `DISCARD` 는 본문을 적용본으로 되돌리고 상태를 `APPLIED` 로 둔다(json 무시). 승인 대기(`PENDING`) 중에는 `UNREQUEST` 외 저장을 거부("승인 대기 중에는 고칠 수 없습니다. 승인 요청을 먼저 취소하세요."). `DRAFT`·`REQUEST` 이력은 같은 사용자의 직전 행이 같은 act 이고 1분 안이면 새 행을 만들지 않는다 | `{ ver, state, updatedAt }` |
| `approve` | `memo` | 상태가 `PENDING` 일 때만. ver + 1, 적용본(base) = 현재 본문, 상태 `APPLIED`, 버전 기록 1행 | `{ ver, approvedAt }` |
| `reset` | 없음 | 시연 초기화: 문서·버전·이력을 모두 지운다(화면이 기본 문서로 다시 `INIT` 한다) | `{ ok: true }` |

이력 `act` 는 `INIT`·`DRAFT`·`REQUEST`·`UNREQUEST`·`DISCARD`·`APPROVE`·`RESET`. `by` 는 로그인 사용자.
