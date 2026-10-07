---
name: classify-by-system
description: "영역 (조업/품질/물류) 단위로 화면들을 ERP / MES / hybrid 로 분류해 신축 시스템의 책임 경계 결정. TIER 5 — TIER 1~4 가 모듈 단위라면 TIER 5 는 영역 횡단 종합. 입력: areaId. 출력: {영역}/{영역}_MES_ERP_분류_분석서.md (+ 메타 박스). 자동 인벤토리 추출 + BPA §2 발췌 + 3대 검증 게이트 내장. 사용 시점: /classify-by-system AREA-ID 호출 시. 예: /classify-by-system 물류, /classify-by-system 품질. 정본: PLUGIN_USAGE.md §13."
---

# 영역 분류 분석 (TIER 5)

> ⭐ **V4.1 (2026-05-13) 신규** — 분류 분석서가 종합 PROCESS_INDEX 의 사전 예측을 무비판 인용해 {CLIENT} 에 존재하지 않는 화면 6개를 분해표에 포함시킨 사고 (MIM010K/521K/522K/550K/560K/570K) 재발 방지를 위한 신규 스킬.
>
> **정본**: [`PLUGIN_USAGE.md §13`](../../docs/external/SampleErp/orgErpReport/PLUGIN_USAGE.md) + [`_AGENT_INSTRUCTIONS.md §10`](../../docs/external/SampleErp/orgErpReport/_AGENT_INSTRUCTIONS.md)

영역 (조업/품질/물류) 내 모든 모듈의 화면을 ERP / MES / hybrid 로 분류해 신축 시스템의 책임 경계를 결정하는 *영역 횡단 종합 산출물* 을 자동 생성한다.

---

## 입력 파라미터

| 파라미터 | 값 | 설명 |
|---|---|---|
| `areaId` | `물류` / `품질` / `조업` | PLUGIN_USAGE.md §1.2.1 영역 매핑 표의 영역명 |

호출 예: `/classify-by-system 물류`

---

## 산출물

```
docs/external/SampleErp/orgErpReport/{areaId}/{areaId}_MES_ERP_분류_분석서.md
```

(+ 선택: `.pptx` PowerPoint, `.xlsx` 정본 테이블 명세서 — 별도 스킬 또는 사용자 요청 시)

---

## 실행 절차 (7 단계)

### Step 0 — 사전 read 의무

다음 파일 반드시 read 후 시작:

1. `PLUGIN_USAGE.md` §13 — TIER 5 정본
2. `_AGENT_INSTRUCTIONS.md` §10 — 서브에이전트 검증 룰
3. (있으면) `{areaId}/{areaId}_MES_ERP_분류_분석서.md` — 이전 버전 (정정 / 갱신 시)

### Step 1 — 영역 식별

`areaId` 파라미터 검증:
- 유효 값: `물류` / `품질` / `조업`
- 기타: 사용자에게 영역 결정 요청

### Step 2 — 모듈 목록 추출

```
ls docs/external/SampleErp/orgErpReport/{areaId}/
```

> 윈도우: 이 단계와 Step 3 의 `ls`·`for` 예시는 Git Bash 에서 실행하거나, 같은 목록을 Glob 도구로 구한다(PowerShell 에서는 문법이 다르다).

폴더만 추출 (md / pptx / xlsx 파일 제외). 결과:
- 물류: 18 모듈 (SFA · SFB · SOA · SOB · ITR · ICA · INV · MIM · STA · STB · STC · STD · MCC · IZA · IPA · IBA · BPG · BPM)
- 품질: 11 모듈 (QMA · QSA · QCA · QIA · QRG · QGA · QNA · QBA · QRA · RMA · GIA)
- 조업: PMA + 향후 모듈

### Step 3 — Gate 1: 정본 화면 인벤토리 추출 (필수)

**금지**: 종합 PROCESS_INDEX 의 §2 mermaid / 매핑 표를 그대로 인용.

각 모듈별로 `screens/*.md` ls:

```
for module in $(ls {areaId}/); do
  echo "=== $module ==="
  ls {areaId}/$module/screens/*.md 2>/dev/null
done
```

산출 — 정본 인벤토리 표 (메모리/임시 파일):

| 모듈 | 화면 ID | 한글명 | BPA 파일 경로 |
|---|---|---|---|
| MIM | MIM001K | 구매입고등록 | MIM/screens/MIM001K_구매입고등록.md |
| MIM | MIM003K | 구매품질문서등록 | MIM/screens/MIM003K_구매품질문서등록.md |
| ... | ... | ... | ... |

**검증**: 인벤토리에 *없는 화면 ID* 는 분류 분석서에 절대 등장 금지.

### Step 4 — Gate 2: 각 BPA §2 시스템 목적 자동 추출 (필수)

각 BPA 파일에서 다음 패턴 Grep:

```
grep -A 5 "^## 2\. 시스템 목적" {BPA-파일}
```

추출할 핵심 신호:

| 신호 | 키워드 | 분류 시사점 |
|---|---|---|
| **외주 / 사내** | "외주 협력사", "사내 가공", "협력사 입고" | 외주 = ERP 측 발주, 사내 = MES 가공 |
| **회계 / 현장** | "회계 분개", "회계 전표", "재고 마스터" vs "위치 배정", "픽킹" | 회계 = ERP, 현장 = MES |
| **결재 / 실물** | "결재 상신", "그룹웨어", "uAssignProc" vs "박스 매핑", "실물 적재" | 결재 = ERP, 실물 = MES |
| **단가 / 금액** | "VAT", "원가", "단가", "환율" | 가격 정보 = ERP |
| **추적 / 품질** | "TRACE", "검사 자동", "LOT 관리" | 추적 = MES |
| **외부 시스템** | "SAP", "외부 통관", "Outlook MAPI", "회계 시스템" | 외부 통합 = ERP 측 책임 |

산출 — 분류 근거 표 (메모리):

| 화면 ID | §2 발췌 (1~2줄) | 핵심 신호 | 분류 후보 |
|---|---|---|---|
| MIM001K | "구매발주 후 서류상 입고 인지 (`SL_MVMT_YN='N'`)" | 회계, 구매 | 🔵 ERP |
| MIM020K | "창고 실물 적재 (`SL_MVMT_YN='Y'`), 위치 배정" | 실물, 위치 | 🟢 MES |
| ... | ... | ... | ... |

**금지**: §2 한 줄도 안 읽고 분류 결정.

### Step 5 — 분류 결정

#### 5.1 자동 분류 (LLM 추론)

Gate 2 의 핵심 신호 기반:
- ERP 신호 ≥ 2 → 🔵 ERP
- MES 신호 ≥ 2 → 🟢 MES
- 양쪽 모두 ≥ 1 또는 모호 → 🟡 hybrid (사용자 검토 대상)

#### 5.2 사용자 검토 게이트 (hybrid 항목)

hybrid 분류된 화면은 사용자에게 확인 (AskUserQuestion 또는 명시 보고):

> "다음 N 개 화면이 ERP / MES 양쪽 신호를 가지고 있어 hybrid 로 분류했습니다. 토의 포인트로 추가할까요?"

### Step 6 — 분류 분석서 MD 작성 (12 섹션 표준)

표준 12 섹션:

1. **§0 회의 배경** — 영역 + 분류 목적
2. **§1 분류 기준** — MES vs ERP 책임 정의
3. **§2 시스템 경계 개념도** — Mermaid (외부 + ERP + MES + hand-off 화살표)
4. **§3 모듈 분류 한눈에** — 영역 내 모든 모듈 표 (모듈 / 화면 수 / 분류 / 근거)
5. **§4 모듈별 상세** — 각 모듈 1~2 단락 (책임, 분류 근거, 주요 화면, ERP 측 hand-off)
6. **§5 분해 필요 모듈 (있으면)** — 화면 단위 분해표 (MIM 같은 hybrid 모듈)
7. **§6 도메인 책임 매트릭스** — 책임 영역별 MES 측 / ERP 측 / hand-off
8. **§7 MES↔ERP Hand-off 인터페이스** — 9~12 개 hand-off 표 (#, hand-off, From→To, 트리거, 권장 패턴)
9. **§8 정합성 위험** — 5~10 개 위험 (분산 트랜잭션, 발번 분산, 모델 결정 등)
10. **§9 데이터 정본** — 테이블별 시스템 책임 표
11. **§10 신축 범위 + Wave** — 1차 이관 범위 + 우선순위 Wave A~E
12. **§11 회의 토의 포인트** — 현업 의견 필요한 결정 사항 (5~10 개)
13. **§12 검증 메타 박스** — 필수 (Step 7)

각 섹션은 [`물류/물류_MES_ERP_분류_분석서.md`](../../docs/external/SampleErp/orgErpReport/물류/물류_MES_ERP_분류_분석서.md) 참조 (정정본).

### Step 7 — Gate 3: 합계 cross-check + 메타 박스

#### 7.1 Cross-check

```
정본 인벤토리 화면 수 (Step 3) = M
분류 결과 합 (MES + ERP + hybrid) = N
```

`M == N` 이어야 함. 불일치 시:
- M > N: 분류 누락된 화면 있음 → Gate 2 다시 실행
- M < N: 가짜 화면 ID 들어감 → 분류 결과 재검토

#### 7.2 메타 박스 첨부

분류 분석서 마지막에:

```markdown
## §12 검증 메타

| 항목 | 값 |
|---|---|
| 검증 일자 | YYYY-MM-DD |
| 영역 | {areaId} |
| 정본 모듈 수 | M_modules |
| 정본 BPA 화면 수 | M_bpa |
| 정본 조회 전용 화면 수 | M_query |
| 분류 결과 합 | MES x + ERP y + hybrid z = N (= M_bpa, ✓ 일치) |
| 인벤토리 추출 명령 | `ls {영역}/*/screens/*.md` 시점 YYYY-MM-DD HH:MM |
| 분류 결정자 | classify-by-system 스킬 + 사용자 hybrid 검토 |
| 미검증 영역 | (있으면 명시 — 없으면 "없음") |
| Gate 1 통과 | ✓ / ✗ |
| Gate 2 통과 | ✓ / ✗ |
| Gate 3 통과 | ✓ / ✗ |
```

---

## 절대 금지 사항 (PLUGIN_USAGE.md §13.6)

| # | 금지 | 사유 |
|---|---|---|
| 1 | 종합 PROCESS_INDEX 화면 ID 무비판 인용 | 메타 인덱스 = 사전 예측 잔재 가능 |
| 2 | "MIMxxxK~yyyK" 범위 표기를 실재로 가정 | 패턴 추측 = 가짜 화면 ID 양산 |
| 3 | screens/ 폴더 ls 생략 | Gate 1 위반 |
| 4 | BPA §2 발췌 생략 | Gate 2 위반 — 분류 근거 없는 분류 |
| 5 | 메타 박스 누락 | 검증 안 된 산출물 |
| 6 | "회의 직전 압박" 핑계 | 검증 안 된 회의 자료 = 의사결정 위험 |
| 7 | Gate 3 cross-check 생략 | 가짜/누락 화면 발견 마지막 기회 |

---

## 보고 형식 (스킬 완료 시)

```
## /classify-by-system {areaId} 완료

### 게이트 통과
- Gate 1 (정본 인벤토리): ✓ — N 모듈 / M BPA + K 조회
- Gate 2 (BPA §2 발췌): ✓ — M BPA 모두 §2 추출
- Gate 3 (cross-check): ✓ — 분류 결과 합 = 정본 화면 수

### 분류 결과
- 🟢 MES: x 화면
- 🔵 ERP: y 화면
- 🟡 hybrid: z 화면 (사용자 검토 결과 반영)

### 산출물
- {areaId}/{areaId}_MES_ERP_분류_분석서.md (M_total 줄)
- 검증 메타 박스 첨부 ✓

### 발견된 핵심 hand-off
- (3~5건)

### 토의 포인트 (현업 의견 필요)
- (3~5건)
```
