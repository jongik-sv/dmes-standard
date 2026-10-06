# bpmn-skill

BPMN 2.0 다이어그램을 작성, 해석, 수정, 검증하는 [Claude Code](https://claude.ai/code) 스킬입니다.

[`@cothe/bpmn-tool`](https://www.npmjs.com/package/@cothe/bpmn-tool) CLI를 사용하여 스키마 안전한 BPMN XML 조작을 수행합니다.

## 주요 기능

- **작성**: 자연어 요청을 BPMN 2.0 다이어그램으로 변환
- **해석**: 기존 BPMN 파일의 구조와 흐름을 분석·설명
- **수정**: 노드/흐름 추가·삭제·속성 변경
- **검증**: 스키마 유효성, 연결 무결성, DI 존재 여부 등 자동 검증
- **미리보기**: 텍스트 기반 흐름 시각화

## 사전 요구사항

```bash
npm install -g @cothe/bpmn-tool
```

- Node.js >= 18

## 설치

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/thecodinglog/bpmn-skill/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/thecodinglog/bpmn-skill/main/install.ps1 | iex
```

### 수동 설치

**macOS / Linux:**
```bash
mkdir -p ~/.claude/skills/bpmn-skill
curl -fsSL https://raw.githubusercontent.com/thecodinglog/bpmn-skill/main/SKILL.md \
  -o ~/.claude/skills/bpmn-skill/SKILL.md
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills\bpmn-skill"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/thecodinglog/bpmn-skill/main/SKILL.md" `
  -OutFile "$env:USERPROFILE\.claude\skills\bpmn-skill\SKILL.md"
```

## 사용법

설치 후 Claude Code에서 `.bpmn` 파일 관련 작업을 요청하면 자동으로 스킬이 활성화됩니다.

```
> 주문 접수부터 출하까지의 프로세스를 BPMN으로 작성해줘
> test.bpmn 파일을 분석해줘
> 이 BPMN에 에러 처리 경계 이벤트를 추가해줘
```

## 라이선스

MIT

## 지원 환경

macOS(`install.sh`)와 윈도우(`install.ps1`, 또는 Git Bash 에서 `install.sh`) 모두 설치할 수 있다. 필요 도구: node·npm(`@cothe/bpmn-tool` 설치용), curl 또는 PowerShell(스킬 파일 내려받기).
