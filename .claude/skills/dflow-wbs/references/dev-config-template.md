# Dev Config 템플릿

`skills/wbs/SKILL.md` 가 WBS 생성 시 헤더 블록과 첫 WP 사이에 삽입하는 `## Dev Config` 섹션의 **단일 공식 템플릿**. TRD 기술 스택 정보로 값을 채움. 추론 불가 항목은 사용자에게 확인.

> 이 파일 = WBS 작성자와 `/dflow-wbs` 가 `## Dev Config` 를 채울 때 보는 **템플릿 정본** (아래 ```markdown 펜스 블록 안이 템플릿 본문).
> `dflow-export` 판 `wbs-parse.mjs` 는 `DEV_CONFIG_MISSING` 에러 메시지를 만들 때 이 파일 경로를 읽지 않음.
> 옛 플러그인 경로(`$CLAUDE_PLUGIN_ROOT/skills/wbs/references/…`)만 보고 이 리포에 없어 **항상 스크립트 내장 폴백 문자열** 사용.
> 두 내용이 어긋나면 이 파일이 사람용 정본.

- `fullstack` domain = unit/e2e 명령이 있는 모든 domain 순차 실행 (fail-fast)
- `-` = 해당 테스트 N/A (그 domain 에 그 유형 테스트 없음)
- `Quality Commands` = Build/Refactor 단계에서 참조. `lint`/`typecheck`/`coverage` 명령 정의. 값이 `-` 이면 생략
- `Cleanup Processes` = 테스트 실행 후 정리할 프로세스 이름 (node, vitest 등). Dev Config 로딩 단에서 `run-test.py` 가 사용

```markdown
## Dev Config

### Domains
| domain | description | unit-test | e2e-test | e2e-server | e2e-url |
|--------|-------------|-----------|----------|------------|---------|
| backend | Server API | `your-unit-test-cmd` | `your-e2e-test-cmd` | - | - |
| frontend | Client UI | `your-unit-test-cmd` | `your-e2e-test-cmd` | `your-dev-server-cmd` | `http://localhost:3000` |
| database | Data layer | - | - | - | - |
| fullstack | Full stack | - | - | - | - |

### Design Guidance
| domain | architecture |
|--------|-------------|
| backend | Your backend architecture description |
| frontend | Your frontend architecture description. 라우팅과 메뉴 연결: 신규 페이지는 즉시 라우터에 등록하고 메뉴/사이드바의 진입점을 같은 Task에서 추가한다. 라우터·메뉴 배선을 분리된 후속 Task로 미루면 orphan page가 발생한다. |

### Quality Commands
| name | command |
|------|---------|
| lint | `your-lint-cmd` |
| typecheck | `your-typecheck-cmd` |
| coverage | `your-coverage-cmd` |

### Cleanup Processes
node, vitest
```
