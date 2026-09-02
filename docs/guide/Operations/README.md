# Operations Guide Index

전체 DMES 배포, 패키지 레지스트리 연동, skill/subtree 동기화 같은 운영성 문서는 이 폴더에 둔다.

## 배포 문서

| 문서 | 소유 범위 |
|---|---|
| [`DMES-Deployment-Guide.md`](DMES-Deployment-Guide.md) | Backend+Frontend 배포 전략·환경·설치·반복배포·승격·rollback·테스트·증적·공통 백로그 단일 정본 |
| [`DMES-Module-Package-Publishing-and-Consumption-Guide.md`](DMES-Module-Package-Publishing-and-Consumption-Guide.md) | 독립 Frontend npm·Backend Nexus 패키지의 발행·버전 고정·소비 계약 |

모듈별 문서는 공통 내용을 복사하지 않고 차이만 추가한다. MPN의 남은 작업은 [APS·MPN 전체 작업](../../aps/TASKS.md), 배포 고유 조건은 [MPN 배포 검증 부록](../../aps/MPN-Deployment-Verification-Addendum.md)을 본다. Portal standalone artifact 생성·이식성 검증은 [`DMES-Deployment-Guide.md` §3](DMES-Deployment-Guide.md#3-frontend-배포)에 포함한다.

## 기타 운영 문서

| 문서 | 역할 |
|---|---|
| [`bpmn-skill-update.md`](bpmn-skill-update.md) | `bpmn-skill` 업스트림 동기화 절차 |
| [`oasis-skill-update.md`](oasis-skill-update.md) | `oasis-project-support` skill 업스트림 동기화 절차 |
| [`oasis-subtree-update.md`](oasis-subtree-update.md) | oasis subtree 동기화 절차 |

Frontend private npm/Verdaccio 상세는 [`../FrontEnd/Verdaccio-Guide.md`](../FrontEnd/Verdaccio-Guide.md)를 함께 본다.
