# 검사증명서(MTC) 발행 — 화면·서버 계약

2026-11-25. 출력물관리 > 검사증명서관리(objectId `inspectionCertificate`)를 목업 `검사증명서_발행_시뮬레이터`(원본 `~/Downloads/mockup`) 기준으로 새로 만든다. 기존 검사증명서 프로그램(발행 요청 → 검토 → 발행 흐름, `TB_MQC_INSP_CERT`)은 지운다.

## 1. 역할 나눔

| 할 일 | 맡는 곳 |
|---|---|
| 값 계산(단건 수정 > 예외 규칙 > 양식 기본값), 양식 자동 선택, 종이 그리기, 발행본(snap) 만들기, 재발행 차이 계산 | 화면(TS 엔진, 목업 `app.html` 의 `resolve`·`paperHtml`·`snapDiff` 이식) |
| 양식·예외 규칙·인터페이스 데이터(증명서 원천)·단건 수정·이미지·발행본·이력 저장, 발행 번호 채번, 신규 수신 복제, 재발행 사유 검사, 시연 초기화 | 서버(mqc OASIS 서비스 `inspectionCertificate`) |

시연 제약: 계산은 화면에서 하고 발행본을 서버에 저장한다. 실제 운영에서는 인터페이스 수신 시 서버가 계산해 자동 발행한다(문서화만, 이번 범위 아님).

## 2. JSON 본문

서버는 본문을 **불투명한 JSON 문자열(CLOB)** 로 저장한다. 목록 표시·검사에 필요한 몇 개 키만 서버가 읽는다(아래 "서버가 읽는 키"). 본문 모양은 목업 `app.html` 의 상태(`S`)를 그대로 따른다.

| 종류 kind | key | 본문(json) | 서버가 읽는 키 |
|---|---|---|---|
| `FORM` | 양식 키 `en`·`ko`·`es` | `{ applied, draft, pending, hist }` (목업 `S.forms[fk]`) | `applied.ver`, `pending` |
| `RULE` | 규칙 id (`R1` …) | 목업 규칙 객체 `{ id, code, grp, name, where, cond, tgt, val, prio, st, ver, draft }` | `code`, `name`, `st`, `prio` |
| `CERT` | 증명서 id (`C1` …, 신규 수신은 `N001` …) | 목업 `CERTS[id]` `{ head, at, kind, cust, coils, … }` | `head.mtc`(증명서번호), `kind`, `cust` |
| `OVR` | 증명서 id | 목업 `S.ovr[id]` `{ form, head, f, remark, coil, … }` | 없음 |
| `IMG` | 파일 이름 | `{ kind: "서명"|"도장", remark, data: "data:image/...;base64,..." }` | `kind` |

## 3. OASIS 동작 — `POST /api/mqc/oasis/inspectionCertificate/{action}`

params 에 배열·객체를 넣지 않는다. JSON 본문은 문자열 파라미터(`json`, `snap`)로 보낸다.

| action | params | 하는 일 | result |
|---|---|---|---|
| `search` | 없음 | 모든 저장값을 한 번에 돌려준다. 저장된 것이 하나도 없으면 시드(§4)를 먼저 넣는다 | `forms`·`rules`·`certs`·`ovrs`·`imgs`: `[{ key, json, updatedAt, updatedBy }]` · `issued`: `[{ certId, mtcNo, issueNo, issuedAt, reissueCnt, reason, snap }]`(issueNo 내림차순) · `hist`: `[{ at, docNo, act, msg, reason, by }]`(최근 200건, 최근 먼저) |
| `save` | `kind`, `key`, `json`(빈 문자열이면 삭제), `act`(이력 동작 이름, 예 `FORM_DRAFT`·`FORM_APPROVE`·`RULE_SAVE`·`RULE_APPLY`·`OVR_SAVE`·`IMG_ADD`), `msg`, `reason` | 저장(있으면 교체) + 이력 1행 | `{ key, updatedAt }` |
| `reg` | `sourceCertId` | 신규 수신 흉내: 원천 증명서 본문을 복제해 새 id(`N` + 3자리)와 새 증명서번호(`UC1-{kind}-{오늘 YYMMDD}-{3자리 순번}`, `head.mtc`)로 저장 + 이력 | `{ certId, json }` |
| `issue` | `certId`, `snap`(발행본 JSON), `msg` | 첫 발행. 이미 발행됐으면 거부("이미 발행된 증명서입니다. 재발행을 쓰세요."). 발행 번호(issueNo)는 기존 최대 + 1 | `{ certId, issueNo, issuedAt }` |
| `reissue` | `certId`, `snap`, `reason`, `msg` | 발행본 교체, reissueCnt + 1. 그 증명서에 단건 수정(OVR)이 있고 reason 이 비면 거부("단건 수정이 있는 증명서는 수정 사유를 넣어야 재발행할 수 있습니다.") | `{ certId, reissueCnt, issuedAt }` |
| `reset` | 없음 | 시연 초기화: 모든 MTC 저장값을 지우고 시드를 다시 넣는다 | `{ ok: true }` |

이력 `act` 는 서버가 `ISSUE`·`AUTO_ISSUE`(시드)·`REISSUE`·`RECEIVE`·`RESET` 을 직접 쓰고, `save` 는 화면이 보낸 `act` 를 쓴다. `by` 는 로그인 사용자.

## 4. 시드

화면 쪽 추출 스크립트(`scripts/mqc-demo/mtc/`)가 목업에서 만들어 `src/backend/mqc/lib/src/main/resources/mqc/mtc/seed.json` 에 쓴다. 서버는 classpath 에서 읽는다. 모양:

```json
{
  "forms":  [{ "key": "en", "json": { } }],
  "rules":  [{ "key": "R1", "json": { } }],
  "certs":  [{ "key": "C1", "json": { } }],
  "ovrs":   [],
  "imgs":   [{ "key": "Z_MTC_SIGN_20251229.png", "json": { "kind": "서명", "remark": "", "data": "data:image/png;base64,..." } }],
  "issued": [{ "certId": "C1", "issueNo": 2, "issuedAt": "2026-11-01T08:10:00", "reissueCnt": 0, "snap": { } }],
  "hist":   [{ "at": "2026-11-01T08:10:00", "docNo": "UC1-1-261101-001", "act": "AUTO_ISSUE", "msg": "자동 발행 (수출 영문 v3)" }]
}
```

`json`·`snap` 은 시드 파일에서는 객체이고, 서버는 문자열로 직렬화해 저장한다. 발행본(snap)은 목업 `fresh()` 처럼 TS 엔진으로 계산해 넣는다.

## 5. 위변조방지 (목업 수준, 2026-11-25 추가)

사용자 지시: "다 목업이야. 실제로 깊이있게 구현할 필요없어. 다시 만들거니까." — 보여 주기 수준으로 얕게 만든다. 진짜 보안(전자서명·키 관리·외부 검증 사이트)은 하지 않는다.

| 요소 | 내용 | 맡는 곳 |
|---|---|---|
| 문서 해시 | 발행·재발행 때 서버가 `snap` 문자열의 SHA-256 을 계산해 저장(`docHash`) | 서버 |
| 진위 확인 번호 | 발행·재발행마다 새로 만든다. 형식 `XXXX-XXXX-XXXX`(해시 + 발행 번호에서 유도, 영대문자·숫자) | 서버 |
| 종이 표시 | 하단에 "진위 확인 번호 · 문서 해시 앞 16자", QR 은 진위 확인 번호로 그린다(목업 `qrUrl` 처럼 모양만), 종이 배경에 옅은 보안 무늬(작은 글씨 반복·물결) | 화면 |
| 진위 확인 패널 | 발행 탭에 "진위 확인": 번호를 넣으면 결과 표시. "위조 흉내"(발행본 값 하나를 바꿔 해시 비교) 버튼으로 불일치 결과를 보여 준다 | 화면 |

OASIS 변경:
- `issue`·`reissue` result 에 `verifyCode`, `docHash` 를 더한다. `search` 의 `issued` 항목에도 `verifyCode`, `docHash` 를 더한다.
- 새 동작 `confirm` — params `verifyCode`, 선택 `snap`. result `{ status, mtcNo, issueNo, issuedAt, reissueCnt, docHash }`. status:
  - `GENUINE` — 현재 발행본의 번호이고, `snap` 을 보냈다면 해시도 같다
  - `TAMPERED` — 번호는 맞지만 보낸 `snap` 의 해시가 다르다
  - `SUPERSEDED` — 재발행으로 대체된 이전 번호
  - `NOT_FOUND` — 없는 번호
- 진위 확인 조회도 이력에 남긴다(`act` = `VERIFY`).
