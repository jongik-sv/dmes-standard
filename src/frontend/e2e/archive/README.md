# e2e/archive

일회성 검증·스냅샷 스펙 보관소.

- playwright `testIgnore: ['**/archive/**']` 로 실행·컴파일 대상에서 빠진다.
- 헬퍼(`e2e/support` 등)를 바꿔 이 안의 import 가 깨져도 고치지 않는다.
- 되살릴 때는 `git mv` 로 `e2e/` 로 꺼낸 뒤 현재 헬퍼에 맞게 고친다.
