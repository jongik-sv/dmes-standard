# docs/mcm — 공통/기준정보(MCM) 모듈 문서

실 프로젝트에서 이 디렉터리는 공통 기준정보 모듈의 문서를 담는다.
권한(RBAC)·메뉴 초기 데이터를 적재하는 시드 SQL, 타 시스템과의 인터페이스 규격서,
화면 설계 문서를 모으는 `design/`, 화면 캡처 참고 이미지를 두는 `screen_image/` 로 구성된다.

## design/ — 공통관리 19 화면 설계 산출물

`src/backend/mcm-core` 와 `src/frontend/m-mcm` 에 실동작 코드로 들어 있는 공통관리 화면들의 5종 산출물이다.
**형식 예시가 아니라 실제로 구현까지 간 산출물**이므로, 신규 화면 설계 시 "이 정도 깊이로 쓰면 된다" 는
기준선으로 쓴다.

| 그룹 | 화면 |
| --- | --- |
| 마스터관리(원장) `cma` | `masterCategoryMng` · `masterCodeSelPop` · `masterCodeUploadFilePopup` |
| 마스터관리(가동) `cme` | `masterCodeMngList` |
| 업무기준관리(원장) `cmb` | `masterRuleList` · `masterRuleData` · `masterRuleDataList` · `masterRuleFrame` · `masterRuleListPop` · `masterRuleFrameColListPopup` · `masterRuleDataUploadFilePopup` |
| 시스템관리 `csa` | `commObjMng` · `commMenuMng` · `commRoleMng` · `commRoleGrpMng` · `commUserMng` · `commPermMng` · `commUserRoleCopy` · `commSyncMng` |

각 폴더는 `{화면}_분석리포트.md` · `_기능설계서.md` · `_디자인설계서.md` · `_BPMN설계서.md` · `_정합체크.md`
(일부는 `_개발체크리스트.md` 추가) 로 구성된다.

> **읽을 때 주의** — 이 문서들은 실제 마이그레이션 프로젝트의 산출물을 이관한 것이다.
> As-Is 분석 절은 원본 레거시 ERP 를 가리키는데, 템플릿에서는 그 이름을 `SampleErp` 로,
> DB 명을 `sample_dmes` 로, 호스트·경로를 자리표시자로 치환했다. 따라서 As-Is 근거 경로
> (`docs/external/SampleErp/...`) 는 **실재하지 않는 참조**다 — 서술의 형식과 깊이만 참고하고,
> 새 프로젝트에서는 자기 레거시 자산 경로로 다시 채운다.

- [`design/sample-screen-design.md`](./design/sample-screen-design.md) — 최소 형식 예시 (빈 프로젝트용)

> 화면 설계 방법론의 정본은 [`docs/guide/design/`](../guide/design/) 의 00~04 가이드와
> `templates/기능설계서.template.md` 이다. 실제 설계서는 그 템플릿을 그대로 채워 쓴다.
