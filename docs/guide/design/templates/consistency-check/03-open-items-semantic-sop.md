## §G. 확인필요 항목 집계

<!-- 검증 대상: 분석리포트 §13 Q-NNN 7 컬럼을 본 절에 그대로 인용. 자체 추가 금지. 미해결 항목은 후속 분석/설계에서 계속 추적. -->

| ID (`Q-NNN`) | 항목 | 내용 | 영향도 (높음/중간/낮음) | 설계 반영 방식 | 후속 조치 | 상태 (open/resolved/wontfix) |
|---|---|---|---|---|---|---|

**§G 결과 (참고)**: open 항목 수 / resolved 항목 수 / wontfix 항목 수 — 본 절은 추적용이므로 ✓/✗ 판정 없음.

---

## §H. 셀 본문 결정성 검증 (R-12 Tier 4 신설 — 1byte 일치도 자동 측정)

> **(MUST)** N차 회귀 결과의 셀 본문 1byte 일치율 측정. 행 ID (S-NNN / G-NNN 등) 기준 cross diff. R-11 시점 38% → R-12 목표: **≥ 80%**, 자유도 0 강화 시 **≥ 95%**.

### H.1 측정 알고리즘 (PowerShell)

```powershell
# Compare-CellBody.ps1 — 행 ID 기준 cross diff 자동 측정
function Compare-CellBody {
  param([string]$A, [string]$B, [string]$Section)
  $rowsA = Get-RowsBySection $A $Section | Where-Object { $_ -match '^\| (S|G|GE|D|L|B|GB|P|ST|LV|Q)-\d{3}' }
  $rowsB = Get-RowsBySection $B $Section
  $totalCells = 0; $matchCells = 0
  foreach ($a in $rowsA) {
    $id = ($a -split '\|')[1].Trim()
    $b = $rowsB | Where-Object { $_ -match "^\|\s*$id\s*\|" } | Select-Object -First 1
    if ($b) {
      $cellsA = ($a -split '\|')[1..10]
      $cellsB = ($b -split '\|')[1..10]
      for ($i = 0; $i -lt $cellsA.Count; $i++) {
        $totalCells++
        if ($cellsA[$i].Trim() -eq $cellsB[$i].Trim()) { $matchCells++ }
      }
    }
  }
  [PSCustomObject]@{ Total=$totalCells; Match=$matchCells; Rate=[math]::Round(($matchCells/$totalCells)*100, 1) }
}
```

### H.2 N차 셀 본문 일치율 매트릭스

| 절 / 영역 | 1차↔2차 | 2차↔3차 | 3차↔4차 | 평균 일치율 (%) | 목표 | 결과 (✓/✗) |
|---|---:|---:|---:|---:|---|---|
| §4.2 S-NNN |  |  |  |  | ≥ 80% |  |
| §4.3 G-NNN |  |  |  |  | ≥ 80% |  |
| §4.3 GE-NNN |  |  |  |  | ≥ 80% |  |
| §4.4 D / L-NNN |  |  |  |  | ≥ 80% |  |
| §4.5 B-NNN |  |  |  |  | ≥ 80% |  |
| §4.5-1 GB-NNN |  |  |  |  | ≥ 80% |  |
| §4.6 P-NNN |  |  |  |  | ≥ 80% |  |
| §9.1 ST-NNN |  |  |  |  | ≥ 80% |  |
| §9.2 LV-NNN |  |  |  |  | ≥ 80% |  |
| §13 Q-NNN (사전 슬롯 7) |  |  |  |  | ≥ 95% |  |
| §1 화면 목적 (패턴 일치) |  |  |  |  | 100% (패턴 enum) |  |
| §0.1 자연제외 표 (L1~L5) |  |  |  |  | 100% |  |

**§H 결과**: 모든 영역 평균 일치율 ≥ 80% (Q-NNN 사전 슬롯 ≥ 95%, §1 / §0.1 = 100%) — 1 영역이라도 ✗ → R-12 미달 + 해당 영역 templates 강화 PR 진행.

---

## §I. 의미 일치도 검증 (R-12 Tier 4 신설 — semantic diff)

> **(MUST)** 1byte 일치도와 별개로 **의미 일치도** 측정. 표기는 다르더라도 분석 결과의 의미가 동일한지 LLM 또는 표 행별 매핑 자동 검증. R-11 시점 88~92% → R-12 목표: **≥ 97%**.

### I.1 의미 일치 판정 기준 (행 ID 기준)

| 의미 일치 케이스 | 1byte | 의미 |
|---|---|---|
| 동일 As-Is 컨트롤 → 동일 화면 표시명 (한글 / 영어 / 후보 표기 차이) | ✗ | ✓ |
| 동일 alias → 동일 To-Be 컬럼 (T2-B 직역 결과) | △ | ✓ |
| 동일 자료형 → 다른 길이 표기 (varchar / varchar(20)) | △ | ✓ |
| 다른 As-Is 컨트롤 → 다른 화면 표시명 | ✗ | ✗ (의미 차이) |
| §1 화면 목적 패턴 같은 enum 채택 | △ | ✓ |
| §1 화면 목적 다른 enum 채택 (조회 vs 등록) | ✗ | ✗ |

### I.2 의미 일치율 매트릭스

| 절 / 영역 | 1차↔2차 | 2차↔3차 | 3차↔4차 | 평균 의미 일치율 (%) | 목표 | 결과 |
|---|---:|---:|---:|---:|---|---|
| §4.2 S-NNN |  |  |  |  | ≥ 95% |  |
| §4.3 G-NNN |  |  |  |  | ≥ 95% |  |
| §4.5 B-NNN |  |  |  |  | ≥ 95% |  |
| §4.6 P-NNN |  |  |  |  | ≥ 95% |  |
| §9.1 ST-NNN |  |  |  |  | ≥ 97% |  |
| §13 Q-NNN |  |  |  |  | ≥ 95% |  |
| §1 화면 목적 (의미) |  |  |  |  | ≥ 95% |  |
| **종합 평균** |  |  |  |  | **≥ 97%** |  |

**§I 결과**: 종합 평균 ≥ 97% — 자유 서술 / 외부 자료 / Agent 추론 영역의 의미 자유도까지 통제됐는지 측정.

---

## §J. SOP 30 Step 실행 검증 (R-13 신설 — 분석 절차 결정성)

> **(MUST)** N차 회귀에서 분석가가 가이드 00 §6.4-R13 의 30 Step 을 동일하게 실행했는지 검증. R-13 핵심 = "분석 결과 자체" 결정성. 17~18차 차이 발생 영역의 직접 차단 검증.

### J.1 PowerShell 검증 함수 본문 (자동 측정)

```powershell
# Verify-Step.ps1 — 단일 Step 종료 조건 검증
function Verify-Step {
  param(
    [int]$StepNo,
    [int]$ExpectedCount,
    [int]$ActualCount,
    [string]$InputFile,
    [string]$OutputSection
  )
  $result = [PSCustomObject]@{
    StepNo = $StepNo
    Expected = $ExpectedCount
    Actual = $ActualCount
    Pass = ($ExpectedCount -eq $ActualCount)
    Section = $OutputSection
    Timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  }
  if (-not $result.Pass) {
    Write-Error "Step $StepNo : $InputFile($ExpectedCount) vs $OutputSection($ActualCount) 불일치 → 재실행 필요"
  }
  return $result
}

# Verify-AllSteps.ps1 — 30 Step 일괄 검증
function Verify-AllSteps {
  param([string]$ReportPath)
  $results = @()
  for ($i = 1; $i -le 30; $i++) {
    $r = Invoke-StepN -StepNo $i -ReportPath $ReportPath
    $results += $r
  }
  $passed = ($results | Where-Object Pass).Count
  Write-Host "Total: 30, Passed: $passed, Failed: $(30 - $passed)"
  return $results
}

# Compare-SOPSteps.ps1 — N차 회귀 SOP 일치율 측정
function Compare-SOPSteps {
  param([string]$A, [string]$B)
  $sectionA = (Get-Content $A | Select-String -Pattern '^\| \d+ \| P\d \|' -AllMatches)
  $sectionB = (Get-Content $B | Select-String -Pattern '^\| \d+ \| P\d \|' -AllMatches)
  $totalSteps = 30; $matchSteps = 0
  for ($i = 0; $i -lt $totalSteps; $i++) {
    if ($sectionA[$i] -eq $sectionB[$i]) { $matchSteps++ }
  }
  [PSCustomObject]@{ Total=$totalSteps; Match=$matchSteps; Rate=[math]::Round(($matchSteps/$totalSteps)*100, 1) }
}
```

### J.2 30 Step 실행 결과 매트릭스 (분석리포트 §-1 인용)

> 분석리포트 §-1 SOP 결과표 30 행 그대로 본 §J.2 에 인용 (자체 추가 ✗).

| Step | Phase | 제목 | 종료조건 | 측정값 | 결과 (✓/△/✗) |
|---:|---|---|---|---|---|
| 1 | P1 | DDL extended property 수집 | (Step 1 종료조건) |  |  |
| 2 | P1 | resx PropBag 수집 | ... |  |  |
| ... | ... | (30 행 모두 분석 §-1 인용) | ... |  |  |
| 30 | P4 | §16 인용 검증 | (Step 30 종료조건) |  |  |

**§J.2 결과**: 30 Step 모두 ✓ → R-13 통과 / 1 개라도 △/✗ → 해당 Step 부터 재실행.

### J.3 N차 회귀 SOP 일치율 매트릭스

> 19~22차 4 회 회귀 시 SOP 30 Step 의 입력 / 명령 / 출력 / 종료조건 / 사례외 처리 5 항목 일치율 자동 측정. 1 항목이라도 < 목표 → R-13 미달.

| Step 항목 | 1차↔2차 | 2차↔3차 | 3차↔4차 | 평균 (%) | 목표 | 결과 (✓/✗) |
|---|---:|---:|---:|---:|---|---|
| **입력 (파일 + 라인범위 1byte)** |  |  |  |  | **100%** |  |
| **명령 (grep 정규식 1byte)** |  |  |  |  | **100%** |  |
| **출력 (행수)** |  |  |  |  | ≥ 98% |  |
| **종료조건 (✓/✗)** |  |  |  |  | ≥ 98% |  |
| **사례외 처리 (Q-NNN ID)** |  |  |  |  | ≥ 95% |  |

**§J.3 결과**: 입력 / 명령 = 100% (drift 0) + 출력 / 종료조건 ≥ 98% + 사례외 ≥ 95% — 모든 행 ✓ 일 때 R-13 통과.

### J.4 분석 결과 자체 일치율 (R-13 핵심 측정)

> R-12 §H (셀 본문 1byte) / §I (의미 일치) 와 별도로 **분석 결과 자체** (행 ID / 행 수 / 분류 결과) 의 일치율 측정. 17~18차 차이 발생 영역 (§0.1 L2 / §0.5 / §11 C5 / §13 Q 신설) 직접 차단 검증.

| 검증 영역 | 1차↔2차 | 2차↔3차 | 3차↔4차 | 평균 | 목표 | 결과 |
|---|---:|---:|---:|---:|---|---|
| §0.1 자연제외 L1~L5 행 수·분류 |  |  |  |  | 100% |  |
| §0.2 S-NNN 좌표 정렬 결과 |  |  |  |  | 100% |  |
| §0.3 G/GE/D/L 분기 분류 결과 |  |  |  |  | 100% |  |
| §0.4 B/GB/S 흡수 분류 결과 |  |  |  |  | 100% |  |
| §0.5 P-NNN 후보 판정 결과 |  |  |  |  | 100% |  |
| §11.1 C1~C6 충족 판정 |  |  |  |  | 100% |  |
| §11.2 채택 패턴 |  |  |  |  | 100% |  |
| §13 Q-NNN 신설 항목 (사전 슬롯 외) |  |  |  |  | ≥ 95% |  |

**§J.4 결과**: 사전 판정표 5종 + C1~C6 = 100% / Q-NNN 신설 ≥ 95% — 모두 ✓ 일 때 R-13 분석 결과 결정성 달성.

---
