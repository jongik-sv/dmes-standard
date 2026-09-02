# Phase 4 - WinForms UI 컴포넌트 분석

SampleErp 화면 분석의 네 번째 단계로, **`{SCREEN-ID}.Designer.cs` 의 `InitializeComponent()` + `{SCREEN-ID}.resx` 텍스트 리소스** 를 분석하여 UI 구조와 인터랙션을 추출한다.

> 산출 JSON 파일명(`ui_analysis.json`) 과 키 이름은 부산 시절 그대로 보존한다 — 산출물 템플릿 호환 우선. 본문 어휘는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) 참조.

## MANDATORY EARLY TERMINATION RULE

**IF NO Designer.cs FILE FOUND for the screen:**
1. Create empty JSON with hasUI: false
2. STOP ALL UI ANALYSIS
3. DO NOT parse XML files (SampleErp has no XML UI)
4. TERMINATE immediately

## 실행 알고리즘

### Step 1: structure.json 및 작업파일 확인

1. **structure.json 경로 확인**: Glob 또는 Read
   - 파일 검색: `{SCREEN-ID}_structure.json` (`docs/external/SampleErp/orgErpReport/{moduleId}/.temp/`)
   - 존재하지 않으면 메시지 출력 후 종료

2. **ui_analysis.json**: 동일 디렉토리
   - **파일 검색**: `{SCREEN-ID}_ui_analysis.json`
   - 재작업 방지 위해 파일이 존재하면 종료

### Step 2: Designer.cs 파일 존재 여부 확인

#### 2-1. Designer.cs 검색
- structure.json 의 `designerPath` 참조 (Phase 1 에서 확정됨)
- 또는 Glob: `docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/**/{SCREEN-ID}*/{SCREEN-ID}.Designer.cs`
- ❌ 검색 실패 시 다른 폴더 검색 금지

#### 2-2. Designer.cs 없을 경우 즉시 조기 종료
1. **빈 JSON 문서 생성**:
   - 출력 위치: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_ui_analysis.json`
   ```json
   {
     "serviceInfo": {
       "serviceId": "string",
       "serviceName": "string",
       "moduleId": "string",
       "analysisDate": "date",
       "analysisModel": "sonnet",
       "serviceType": "batch"
     },
     "hasUI": false,
     "uiAnalysis": {
       "uiComponents": []
     }
   }
   ```

2. **즉시 종료**

#### 2-3. Designer.cs 있을 경우에만 진행

### Step 3: Designer.cs 파싱

1. **Designer.cs Read** (Serena 사용 가능 시 활용)

2. **InitializeComponent() 메서드 추출**
   - `private void InitializeComponent() { ... }` 블록 내용 식별

3. **컴포넌트 인벤토리 작성** (정규식 추출)

| 정규식 | 의미 |
|---|---|
| `this\.(\w+)\s*=\s*new\s+([\w\.]+)\(\);` | 컴포넌트 ID + 풀 타입명 |
| `this\.(\w+)\.(\w+)\s*=\s*(.+?);` | 속성 설정 (`Location`, `Size`, `Text`, `TabIndex`, `Dock`, `Anchor`, `BackColor` 등) |
| `this\.(\w+)\.(\w+)\s*\+=\s*new\s+[\w\.]+\(this\.(\w+)\);` | 이벤트 → 핸들러 매핑 (예: `btnSearch.Click += new EventHandler(this.btnSearch_Click);`) |
| `this\.(\w+)\.Controls\.Add\(this\.(\w+)\);` | 부모-자식 (컨테이너 추가) |
| `this\.(\w+)\.SuspendLayout\(\);` | 컨테이너 식별 |

4. **레이아웃 구조 분석**
   - **부모 Form**: `this.{SCREEN-ID}` 또는 첫 번째 `Form` 타입 컴포넌트
   - **컨테이너 컴포넌트**: `Panel`, `GroupBox`, `SplitContainer`, `TabControl`, `TableLayoutPanel`, `FlowLayoutPanel`
   - **Dock/Anchor 속성**:
     - `Dock = DockStyle.Top/Bottom/Left/Right/Fill` → 도킹 방향
     - `Anchor = AnchorStyles.Top | AnchorStyles.Left | ...` → 앵커 방향
   - **트리 구조**: `Controls.Add` 관계로 컨테이너 → 자식 트리 작성

5. **컴포넌트 타입 분류** (산출 JSON 의 `components[].type` 키)

| Designer 컴포넌트 타입 | 매핑된 type |
|---|---|
| `Form`, `UserControl` | `layout` (최상위) |
| `Panel`, `GroupBox`, `SplitContainer`, `TableLayoutPanel`, `FlowLayoutPanel` | `layout` |
| `FpSpread`, `DataGridView`, `C1FlexGrid` | `grid` |
| `TextBox`, `ComboBox`, `DateTimePicker`, `Label`, `CheckBox`, `RadioButton`, `Button` (입력 그룹) | `form` |
| `MenuStrip`, `ToolStrip` | `menu` |
| `TabControl`, `C1TabControl` | `tabbar` |
| `Button` 단독 (action) | `button` |
| `StatusStrip`, `MessageBoxEx` | `messagebox` |
| 기타 | `htmlObj` 호환 자리 (의미: "기타") |

6. **이벤트 핸들러 추출**
   - `Click`, `TextChanged`, `SelectedIndexChanged`, `CellClick`, `Form_Load`, `Form_Closing` 등
   - 핸들러 메서드 이름 (cs partial class 안에서 정의됨)

### Step 4: .resx 텍스트 리소스 머지

`{SCREEN-ID}.resx` Read. 키-값 추출:
- 컴포넌트 텍스트 (`btnSearch.Text` 같은 키)
- 메시지/타이틀 텍스트
- 이미지 리소스 참조

머지 규칙:
- Designer.cs 의 컴포넌트 속성에 `resources.GetString("X.Text")` 또는 `resources.ApplyResources(this.X, "X")` 가 있으면 .resx 의 해당 키 값으로 채움
- 다국어 .resx (`{SCREEN-ID}.ko.resx`, `{SCREEN-ID}.en.resx`) 가 있으면 발견한 모든 언어 보존

### Step 5: ui_analysis.json 생성

**출력 위치**: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_ui_analysis.json`

**JSON 스키마 (부산 시절 그대로 보존)**:
```json
{
  "analysisModel": "sonnet",
  "layout": {
    "type": "layout",
    "dirType": "row",
    "totalHeight": "800px",
    "totalWidth": "100%",
    "components": [
      {
        "id": "panelSearch",
        "type": "form",
        "height": "80px",
        "fields": [
          {"id": "dtpFrom", "type": "calendar", "label": "시작일자", "componentType": "DateTimePicker"},
          {"id": "dtpTo", "type": "calendar", "label": "종료일자", "componentType": "DateTimePicker"},
          {"id": "cboYard", "type": "combo", "label": "야드", "componentType": "C1Combo"}
        ],
        "buttons": [
          {"id": "btnSearch", "label": "조회", "event": "btnSearch_Click"},
          {"id": "btnSave", "label": "저장", "event": "btnSave_Click"}
        ]
      },
      {
        "id": "fpSpread1",
        "type": "grid",
        "height": "600px",
        "componentType": "FpSpread",
        "editable": true,
        "split": 3,
        "columns": [
          {"id": "JOB_ID", "width": "120", "header": "Job ID", "editable": false, "type": "text"},
          {"id": "COIL_WGT", "width": "100", "header": "코일중량", "type": "number"},
          {"id": "AW_WGT", "width": "100", "header": "배분중량", "type": "number", "editable": true}
        ]
      }
    ]
  },
  "events": [
    {
      "handler": "btnSearch_Click",
      "trigger": "btnSearch.Click",
      "flow": [
        "1. 입력값 검증",
        "2. AppDB.Execute('doSelectJobList') 호출",
        "3. fpSpread1 데이터 바인딩"
      ]
    }
  ]
}
```

> **dirType 매핑**: WinForms 의 `Dock`/`Anchor`/`SplitContainer.Orientation` 을 부산의 `row`/`col`/`tab` 으로 매핑.
>   - `SplitContainer.Orientation = Vertical` 또는 `Dock=Top/Bottom` 위주 → `row` (세로 배치)
>   - `SplitContainer.Orientation = Horizontal` 또는 `Dock=Left/Right` 위주 → `col` (가로 배치)
>   - `TabControl` 또는 `C1TabControl` → `tab`

### Step 6: 외부 컴포넌트 라이브러리 의미 매핑

분석 시 컴포넌트 타입이 다음과 같으면 의미를 함께 기록:

| 컴포넌트 타입 | 의미 |
|---|---|
| `System.Windows.Forms.TextBox` | 입력 필드 |
| `System.Windows.Forms.ComboBox`, `C1.Win.C1List.C1Combo` | 콤보 박스 |
| `System.Windows.Forms.DateTimePicker`, `C1.Win.C1Input.C1DateEdit` | 날짜 선택 |
| `System.Windows.Forms.Button` | 버튼 |
| `System.Windows.Forms.CheckBox`, `RadioButton` | 체크박스/라디오 |
| `System.Windows.Forms.DataGridView`, `C1.Win.C1FlexGrid.C1FlexGrid` | 그리드 (표준) |
| `FarPoint.Win.Spread.FpSpread` | 그리드 (FarPoint 메인) |
| `KsmK.Foundation.SmartLabel` | 라벨 (다국어) |

## 주의사항
- **최우선**: Designer.cs 존재 여부 먼저 확인 - 없으면 즉시 조기 종료
- 비-UI partial class (서비스/배치 클래스) 일 수 있음 — Designer.cs 가 없는 경우 자연 발생
- 메모리 최적화: 한 번에 한 컴포넌트씩만 적재
- 컨테이너 재귀 구조: Panel 안의 Panel 가능
- **JSP/XML UI 미사용**: SampleErp 는 WinForms 데스크톱 — JSP, JavaScript, Form/Grid XML 모두 해당 없음

## 에러 처리
- structure.json 없음 → 즉시 종료
- Designer.cs 없음 → 빈 JSON 생성 후 조기 종료 (정상 처리)
- 파싱 오류 → 에러 로그 후 가능한 만큼 추출
