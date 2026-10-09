# ERD 도구 조사 메모 (2026-10-09)

[연구 보고서](../2026-10-09-erd-tool-research.md) 의 원본 메모다. 서브에이전트가 쓴 그대로 옮겼고, 로컬 비밀번호와 client key 값만 가렸다.

- 메모에 나오는 `scratchpad/erd/...` 경로는 조사 세션의 임시 폴더다. 그곳에 받은 파일(exERD 도움말 원문, 제품 jar, 오픈소스 clone, 제3자 샘플 파일)은 라이선스 때문에 리포에 넣지 않았다.
- 앞의 웹 조사(A·B·G)는 요약기를 거친 자료라 근거가 얕다. 같은 주제는 뒤의 심층 메모(A2·H·I)를 우선한다.

| 메모 | 주제 | 주된 근거 |
|---|---|---|
| [A](A-exerd.md) | exERD 기능(1차) | 웹 [2차] |
| [A2](A2-exerd-deep.md) | exERD 도움말 원문, 메타모델(`exerd.ecore`), 단축키 | 원문 |
| [B](B-oss-tools.md) | 오픈소스·상용 ERD 도구 비교 | 웹 [2차] |
| [C](C-diff-sot.md) | diff→ALTER 도구, 이름 변경 처리, Oracle 함정, 정본 안 | 웹 [2차] |
| [D](D-ai-mcp.md) | DB·ERD MCP 사례, 편집 API·실시간·잠금 설계 | 웹 [2차] |
| [E](E-standards.md) | 한국 데이터 표준화, 논리명→물리명 변환 | 웹 [2차] |
| [F](F-codebase.md) | 우리 리포 자산, 로컬 Oracle 메타 | 리포 원문·DB 실측 |
| [G](G-formats-features.md) | 파일 포맷·기능 매트릭스(1차) | 웹 [2차] |
| [H](H-erd-editor-src.md) | ERD Editor·ChartDB·drawDB 소스 분석, MCP tool 목록 | 소스 원문 |
| [I](I-formats-deep.md) | DBML 문법, Oracle Data Modeler·exERD·AML 등 실물 파일 구조 | 실물·문법 원문 |
| [J](J-relation-inference.md) | FK 없는 스키마의 관계 추정 실측 | DB 실측·리포 원문 |
