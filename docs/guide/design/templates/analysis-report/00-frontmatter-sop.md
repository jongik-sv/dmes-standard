---
screenId: {화면식별자}
asIsId: {As-Is 코드}
moduleId: {moduleId}
moduleGroup: {moduleGroup}
작성일: YYYY-MM-DD
작성자: Agent
---

<!--
  본 템플릿 = 분석리포트 산출물의 자기완결적 정본 양식 (R-12).
  분석가는 본 templates 만 읽고 작업한다 — 가이드 외부 참조 ✗.
  절 순서 / 표 헤더 / frontmatter 6 필드 / 빈 표 행 / 예시 마커 모두 변경 금지 (MUST).
  자유 서술 영역 = 0 (모든 영역 패턴 또는 enum 강제 — Tier 5).
  매핑 사례 라이브러리 = 표 위 주석에 박힘 (Tier 6) — 분석가는 사례 매칭만 수행, 자체 추론 ✗.
-->

# {화면명} 분석리포트

## §-1. SOP 30 Step 실행 결과 기록표 (R-13 신설 — 분석 시작 전 작성 강제)

> **(MUST)** 본 §-1 = 가이드 00 §6.4-R13 의 30 Step 을 따른 결과의 자기 보고. Step 1~30 순서대로 실행하며 각 Step 종료 조건 충족 시 ✓, 사례 외 발견 시 Q-NNN 등재 후 △, 종료 조건 미충족 시 ✗.
> 본 §-1 의 모든 Step 이 ✓ 가 아니면 §0~§16 작성 ✗ + 정합체크서 §J ✗ + 게이트 G10 ✗.
> Step 본문 (입력/명령/출력/종료조건/사례외) 정본은 가이드 00 §6.4-R13.{N} — 본 §-1 은 결과 기록만 (자체 변경 ✗).

### R14-Step0. Auto Manifest 본처리 (R-14 신설 — 분석 시작 전 1번째 행동)

> **(MUST)** 본 R14-Step0 = 외부 deterministic Auto Manifest Runner 가 생성한 9 파일을 인용. Agent 가 Runner 를 실행할 수는 있으나 결과를 해석·수정·보완·재분류할 수 없다 (00 §0.2.0 9 원칙).
> `conflict-report.json` 존재 → 본 R14-Step0 = ✗ + §0~§16 작성 ✗ + 모든 산출물 생성 ✗ (00 §0.2.0 원칙 7).
> `verify-report.json` pass=false → 본 R14-Step0 = ✗ + 산출물 임의 수정 ✗ → 실패 보고만 (00 §0.2.0 원칙 8).

**Auto Manifest 본처리 결과 (9 파일 hash 인용)**:

| 항목 | 값 |
|---|---|
| moduleId (00 §0.2.2 결정 결과) | {moduleId} |
| targetKey (00 §0.2.4 결정 결과) | {targetKey} |
| screenId (Auto Manifest 후 확정) | {screenId} |
| manifest 디렉토리 | `docs/{moduleId}/manifest/{targetKey}/` |
| conflict-report 존재 여부 | Y / N |
| verify-report.pass | true / false |

| # | 파일 | 경로 | hash (SHA-256) | 결과 |
|---:|---|---|---|---|
| 1 | `manifest.lock.json` | `docs/{moduleId}/manifest/{targetKey}/manifest.lock.json` | {hash} | ✓ / ✗ |
| 2 | `index.json` | `docs/{moduleId}/manifest/{targetKey}/index.json` | {hash} | ✓ / ✗ |
| 3 | `discover.trace.json` | `docs/{moduleId}/manifest/{targetKey}/discover.trace.json` | {hash} | ✓ / ✗ |
| 4 | `classify.trace.json` | `docs/{moduleId}/manifest/{targetKey}/classify.trace.json` | {hash} | ✓ / ✗ |
| 5 | `fallback.trace.json` | `docs/{moduleId}/manifest/{targetKey}/fallback.trace.json` | {hash} | ✓ / ✗ |
| 6 | `q-stable-key.json` | `docs/{moduleId}/manifest/{targetKey}/q-stable-key.json` | {hash} | ✓ / ✗ |
| 7 | `conflict-report.json` | `docs/{moduleId}/manifest/{targetKey}/conflict-report.json` | {hash} 또는 (없음) | ✓ (= 없음) / ✗ (= 존재 → 산출물 생성 ✗) |
| 8 | `verify-report.json` | `docs/{moduleId}/manifest/{targetKey}/verify-report.json` | {hash} | ✓ (pass=true) / ✗ (pass=false) |
| 9 | `error.log` | `docs/{moduleId}/manifest/{targetKey}/error.log` | {hash} 또는 (없음) | ✓ (ERROR/FATAL 0) / ✗ |

**R14-Step0 결과**: 9 파일 모두 ✓ + conflict-report 미존재 + verify-report.pass=true → R14-Step0 ✓ → §-1 Step 1~30 + §0~§16 진행 가능 / 1 개라도 ✗ → 산출물 생성 ✗ (00 §0.2.0 9 원칙).

> **§0 ~ §16 작성 시 인용 규칙**: §0.1 자연제외 / §0.2 좌표 정렬 / §0.3 분기 분류 / §0.4 흡수 분류 / §0.5 P-NNN 후보 / §13 Q-NNN 모두 본 R14-Step0 의 `discover.trace.json` / `classify.trace.json` / `fallback.trace.json` / `q-stable-key.json` 결과를 인용한다 (Agent 자체 추론 ✗ — 00 §0.2.0 원칙 5).

---

| Step | Phase | 제목 (00 §6.4-R13.N 인용) | 명령 (C-1~C-7) | 측정값 | 종료조건 | 결과 (✓/△/✗) | Q-NNN |
|---:|---|---|---|---|---|---|---|
| 1 | P1 | DDL extended property 수집 | C-1 | (검사 테이블 N개) | ext.prop. 존재 여부 결정 |  |  |
| 2 | P1 | resx PropBag 수집 | C-1 | (data 노드 N개) | resx 존재 시 grep 완료 |  |  |
| 3 | P1 | 운영 화면 캡처 확인 | C-1 (Test-Path) | (Y/N) | 캡처 존재 결정 |  |  |
| 4 | P1 | 매핑 문서 수집 | C-1 (Test-Path) | (Y/N) | 매핑 존재 결정 |  |  |
| 5 | P1 | Entity 구조 수집 | C-1 | (@Column N개) | Entity 존재 시 §7 행수 일치 |  |  |
| 6 | P2 | designer.cs Visible=false (L1) | C-1 | (grep 라인 N) | grep 라인수 == §0.1 L1 행수 |  |  |
| 7 | P2 | 주석 처리 (L2) | C-1 | (// + -- N) | 주석 라인수 == §0.1 L2 행수 |  |  |
| 8 | P2 | 호출 미발견 (L3) | C-7 | (메서드∩미등록 N) | cs 메서드∩+= 미발견 모두 등재 |  |  |
| 9 | P2 | 외부 화면만 (L4) | C-5 | (외부 호출 N) | 외부 호출 모두 등재 |  |  |
| 10 | P2 | S-NNN 좌표 정렬 | C-7 | (grpsearch 컨트롤 N) | Y→X→알파벳→선언줄 정렬 |  |  |
| 11 | P2 | G/GE/D/L 분기 분류 | C-7 | (@Case N) | 모든 분기 분류 완료 |  |  |
| 12 | P2 | B/GB/S 흡수 분류 | C-1 | (button 컨트롤 N) | 4 enum 분류 완료 |  |  |
| 13 | P3 | §4.2 S-NNN 본 표 (§0.2 인용) | (자체 grep ✗) | (행 N) | §0.2 행수 == §4.2 행수 |  |  |
| 14 | P3 | §4.3 G/GE-NNN (§0.3 인용) | (자체 grep ✗) | (행 N) | §0.3 G+GE 행수 == §4.3 행수 |  |  |
| 15 | P3 | §4.4 D/L-NNN (§0.3 인용) | (자체 grep ✗) | (행 N) | §0.3 D+L 행수 == §4.4 행수 |  |  |
| 16 | P3 | §4.5 B-NNN (§0.4 B 인용) | (자체 grep ✗) | (행 N) | §0.4 B 행수 == §4.5 행수 + action 7 enum 매칭 |  |  |
| 17 | P3 | §4.5-1 GB-NNN (§0.4 GB 인용) | (자체 grep ✗) | (행 N) | §0.4 GB 행수 == §4.5-1 행수 |  |  |
| 18 | P3 | §4.6 P-NNN (§0.5 직접 인용) | (자체 grep ✗) | (행 N) | §0.5 직접 호출 행수 == §4.6 행수 |  |  |
| 19 | P3 | D1~D3 외부 호출 깊이 | C-1 | (D1/D2/D3 N) | D3 까지 추적 완료 |  |  |
| 20 | P3 | 이벤트 12종 매트릭스 | C-1 | (12 행) | 12 이벤트 모두 grep |  |  |
| 21 | P3 | SP 분기 매트릭스 | (Step 11 재사용) | (행 N) | §0.3 행수 == §5.2 행수 |  |  |
| 22 | P3 | §6/§7/§8/§9.1/§9.2/§10/§11 본 표 | (절별 알고리즘) | (행 N) | 사전 판정 == 본 표 (절별) |  |  |
| 23 | P4 | C1~C6 자동 판정 | (C 별 측정 enum) | (충족 N) | C1~C6 Y/N 결정 |  |  |
| 24 | P4 | §11.2 채택 (T3-D) | (충족 수 enum) | (채택 1 값) | enum 1 값 결정 |  |  |
| 25 | P4 | §11.3 자연제외 (§0.1 인용) | (전수 인용) | (행 N) | §0.1 행수 == §11.3 행수 |  |  |
| 26 | P4 | §13 Q-NNN 정리 | C-7 | (Q 갯수 N) | 본문 [Q] == §13 행수 + 사전 슬롯 7 매칭 |  |  |
| 27 | P4 | §14 커버리지 매트릭스 | (수치 합산) | (전 행) | 발견 = 반영 + Q + 제외 |  |  |
| 28 | P4 | §15 게이트 G1~G9 | (게이트 측정) | (G N) | G1~G9 모두 ○ |  |  |
| 29 | P4 | §-1 SOP 결과 기록 | (자동 집계) | (Step ✓ N) | 30 Step 모두 ✓ |  |  |
| 30 | P4 | §16 인용 검증 | (전수 점검) | (인용 N) | §16 위치 == 본 §X.Y 일치 |  |  |

**§-1 결과**: 30 Step 모두 ✓ → R-13 통과 + 분석리포트 작성 완료 / 1 개라도 △/✗ → 해당 Step 부터 재실행 (이전 Step 결과 보존, 후속 Step 결과 폐기).

---
