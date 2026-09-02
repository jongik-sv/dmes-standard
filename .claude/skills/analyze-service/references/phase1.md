# Phase 1 - 구조 파악 및 파일 수집

SampleErp 화면 분석의 첫 번째 단계로, **C# WinForms 화면 폴더(`{SCREEN-ID}.cs` + `{SCREEN-ID}.Designer.cs` + `{SCREEN-ID}.resx`)** 를 파싱하여 전체 구조를 파악하고 관련 파일 경로를 수집한다.

> 산출 JSON 파일명·키 이름은 부산 시절 그대로 보존한다. 본문 어휘는 [`_shared/vocabulary-mapping.md`](../../_shared/vocabulary-mapping.md) 참조.

## 실행 방법 (MVP — LLM 직접 분석)

부산용 `phase1-analyzer.js` 는 GLUE Service XML 전용이라 SampleErp 입력에 호환되지 않는다. 본 단계는 **Read/Glob 도구로 직접 파싱**하여 동일 JSON 스키마로 출력한다.

## 실행 알고리즘

### Step 1: 화면 폴더 위치 확인

1. **moduleId 추출**: SCREEN-ID 의 앞 3글자 (예: `SOA004K` → `SOA`)
2. **화면 폴더 검색**: Glob 도구로 `docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/**/{SCREEN-ID}*/{SCREEN-ID}.cs`
   - 화면 폴더는 일반적으로 `{SCREEN-ID}.{한글설명}/` 형태 (예: `SOA004K.{CLIENT} Job매칭/`)
   - 단순 코드 폴더(`{SCREEN-ID}/`)도 가능. Glob 의 `{SCREEN-ID}*/` 가 두 경우 모두 잡는다
3. **재작업 방지**: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_structure.json` 존재 시 종료

### Step 2: Designer.cs 파싱

`{SCREEN-ID}.Designer.cs` Read. `InitializeComponent()` 메서드 안의 패턴 정규식 추출:

| 패턴 | 정규식 | 의미 |
|---|---|---|
| 컴포넌트 선언 | `this\.(\w+)\s*=\s*new\s+([\w\.]+)\(\);` | 컴포넌트 ID + 타입 |
| 속성 설정 | `this\.(\w+)\.(\w+)\s*=\s*(.+?);` | 속성 (`Location`, `Size`, `TabIndex`, `Text` 등) |
| 이벤트 바인딩 | `this\.(\w+)\.(\w+)\s*\+=\s*new\s+[\w\.]+\(this\.(\w+)\);` | 이벤트 → 핸들러 매핑 |
| 부모-자식 | `this\.(\w+)\.Controls\.Add\(this\.(\w+)\);` | 컨테이너 → 자식 |

각 컴포넌트는 BPA/레거시 산출물의 "Activity" 자리에 들어간다. 컴포넌트 분류 (산출 JSON 의 `activities[].type` 키에 매핑):

```
If 컴포넌트 타입이 Foundation/Shared 의 base class 또는 ComponentOne/FarPoint 라이브러리 (C1*, FpSpread 등) 이면
  → type: "framework"
Else If 사용자 정의 namespace (KsmK 프로젝트 내 partial class) 이면
  → type: "custom"
Else (System.Windows.Forms 표준 컨트롤 — TextBox, Button, Label 등)
  → type: "common"
End If
```

**예시**:
- `System.Windows.Forms.TextBox` → **common**
- `FarPoint.Win.Spread.FpSpread` → **framework** (외부 라이브러리)
- `KsmK.Foundation.SmartLabel` → **framework** (Foundation 베이스)
- `KsmK.Tasks.영업관리.수주관리.SOA004K.SubDialog` → **custom**

### Step 3: cs partial class 파싱

`{SCREEN-ID}.cs` Read. 추출:

1. **클래스 헤더**:
   - `namespace XXX { ... public partial class {SCREEN-ID} : {BaseClass} { ... } }`
   - 베이스 클래스 (`FormWith1Grid`, `DialogWith1Grid` 등)
   - 구현 인터페이스

2. **메서드 목록**:
   - `private void btnXxx_Click(object sender, EventArgs e) { ... }` (이벤트 핸들러)
   - `protected override void OnSearch() { ... }` (베이스 클래스 오버라이드)
   - `private void DoSomething(...) { ... }` (비즈니스 메서드)
   - 진입점에 해당하는 핸들러는 부산의 "doMainActivity" 자리에 매핑

3. **Procedure 호출 추출**:
   - `AppDB\.Execute\(\s*"(\w+)"` → procedure 이름
   - `MainQuery\.Get\(\s*"(\w+)"` → query 이름
   - `new\s+SqlCommand\(\s*"([^"]+)"` → inline SQL
   - 추출한 procedure 이름은 `dataFlow.javaSqlQueries` 배열로 (이름 보존)

4. **다른 화면 호출 (서브화면) 추출**:
   - `new\s+(\w+K)\(\)\.\s*ShowDialog\(\)` → 다이얼로그 호출
   - `new\s+(\w+K)\(\)\.\s*Show\(\)` → 자식 화면 호출
   - 추출한 화면명은 `subServices` 배열로

### Step 4: structure.json 생성

- **JSON 스키마 키 이름은 부산 시절 그대로 보존** (산출물 동일성 우선)
- **출력 위치**: `docs/external/SampleErp/orgErpReport/{moduleId}/.temp/{SCREEN-ID}_structure.json`

**JSON 스키마**:
```json
{
  "serviceId": "SOA004K",
  "serviceName": "[Designer.cs Form.Text 또는 화면 폴더명에서 추출]",
  "process": "soa",
  "serviceType": "ui",
  "moduleId": "SOA",
  "serviceXmlPath": "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.cs",
  "designerPath": "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.Designer.cs",
  "resxPath": "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.resx",
  "screenFolder": "Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭",
  "domainPath": "영업관리/수주관리",
  "baseClass": "FormWith1Grid",
  "activities": [
    {
      "name": "초기화",
      "class": "System.Windows.Forms.Form.Load",
      "type": "common",
      "properties": []
    },
    {
      "name": "조회",
      "class": "SOA004K.btnSearch_Click",
      "type": "custom",
      "properties": [
        {"sqlkey": "SOA004K.selectJobList", "resultkey": "fpSpread1"}
      ]
    }
  ],
  "custom_activities": [
    "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.cs"
  ],
  "serviceStructure": {
    "customActivities": [
      {
        "name": "메인 partial class",
        "className": "SOA004K",
        "filePath": "docs/external/SampleErp/orgErpSource/KsmK Project/Tasks/영업관리/수주관리/SOA004K.{CLIENT} Job매칭/SOA004K.cs"
      }
    ]
  },
  "subServices": [
    "SOA005K"
  ],
  "dataFlow": {
    "sqlQueries": [
      "SOA004K.selectJobList"
    ],
    "javaSqlQueries": [
      "doSelectJobList",
      "doSaveJobMatch"
    ],
    "potentialSqlQueries": [
      {
        "activityName": "btnSearch_Click",
        "propertyKey": "AppDB.Execute",
        "sqlKey": "doSelectJobList",
        "source": "SOA004K.cs:142"
      }
    ],
    "lastUpdated": "[생성일자 ISO 8601]"
  }
}
```

> **키 이름 보존**: `javaSqlQueries` 는 부산 시절 키. SampleErp 환경에서는 "C# 코드 안에서 추출한 procedure 호출명" 의미로 사용. 산출물 템플릿 호환을 위해 키명은 변경하지 않는다.

### Step 5: structure.json 확인
- **중요 내용**: JSON 스키마 준수했는지 검사
- **activities** 안의 클래스 type 키가 있는지 확인 (무조건 있어야 함)

## 에러 처리
- Designer.cs / cs 파일 없음 → 즉시 종료
- 화면 폴더 검색 실패 → 즉시 종료 ("SCREEN-ID {ID} 의 화면 폴더를 SampleErp 안에서 찾지 못했습니다")
- 디렉토리 생성 실패 → 권한 확인
- `.temp/` 디렉토리 없으면 자동 생성
