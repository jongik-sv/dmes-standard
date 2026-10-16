# 구조 변경 기록 — 빌드 레인 (refactor-be/build)

이 문서는 BE 리팩토링 2회차 build 레인(`refactor-be/build`)의 구조 변경을 적는다. 형식은 1회차 [README.md](../refactor-2026-10/README.md) §6.1 을 따른다. 항목 ID 는 [README.md](./README.md) §3 표의 ID 다.

| 번호 | 항목 | 제목 |
|---|---|---|
| S1 | D5 | mls/lib 에서 쓰지 않는 jsoup 의존 제거 |

## S1. mls/lib 에서 쓰지 않는 jsoup 의존 제거 (D5)
- 커밋: 6ba1bfd5d
- finding 정정: [findings.md](./findings.md) D5 는 「mls·mpp·mqc·mpn 의 jsoup, 사용처는 mcm 뿐」이라고 적었다. 코드를 다시 확인한 결과는 다르다.
  - jsoup 선언은 `mls/lib/build.gradle` 하나에만 있었다. mpp·mqc·mpn 의 `lib/build.gradle` 에는 jsoup 줄이 없고, `git log -S jsoup` 에도 이 세 모듈의 이력이 없다(기준 f911dd50f 에서도 같다).
  - 사용처는 mcm 만이 아니다. `mdm/lib/…/common/dictionary/ColumnDescriptionSanitizer.java`(와 그 시험)도 jsoup 을 쓴다. mcm/lib·mdm/lib 은 각자 `implementation libs.jsoup` 를 직접 선언하므로 그대로 둔다.
  - 그래서 D5 범위를 「mls/lib 의 jsoup 1건 제거」로 줄였다(조정자 확인).
- 바뀌기 전: `mls/lib/build.gradle` 이 `implementation libs.jsoup`(1.23.2)를 선언했다. 2026-10-02 공지 본문 HTML 소독용으로 넣은 것이다. 공지 코드는 f024b5b73·b8c4ccd7a 에서 mcm 으로 옮겨졌고, mls 소스에는 `org.jsoup` import 가 0건이다. mls 는 mcm(lib)을 의존하지 않는다(cactus-core·mcm-core·maru-mdm-engine 만).
- 바뀐 뒤: `mls/lib/build.gradle` 에서 `implementation libs.jsoup` 와 그 위 주석 2줄을 뺐다. 카탈로그(`gradle/libs.versions.toml`)의 `jsoup` 항목은 mcm·mdm 이 쓰므로 유지한다.
- 바꾼 이유: 쓰지 않는 라이브러리가 mls.war 에 실려 배포 크기와 취약점 관리 대상이 늘었다.
- 동작 보존 근거: 같은 명령 `gradlew -p mls build --continue` 의 전후 결과를 비교했다.
  - 시험 수가 같다. lib 2/2 통과(`SampleInventoryItemServiceTest`). api 5건 중 실패 3·건너뜀 2(전후 같음).
  - api 실패 3건(`JobAgentWiringTest`)은 바꾸기 전부터 실패하던 시험이다. 원인은 yml 기본 Oracle 접속의 `ORA-01017`(logon denied)이고 이 변경과 무관하다. 건너뜀 2건(`MlsOracleSmokeTest`·`MlsColumnOrderOraTest`)은 시험 PDB 접속값(`dmes.ora.url`)이 없어 assume 으로 건너뛴다. 따라서 이 기준선은 Oracle 시험 없이 잰 것이다.
  - `mls.war` 의 jar 목록: 119개 → 118개. 빠진 것은 `WEB-INF/lib/jsoup-1.23.2.jar` 하나다.
  - `:api`·`:lib` 의 `runtimeClasspath` 의존성 보고서: `org.jsoup:jsoup:1.23.2` 줄만 빠졌다(나머지 차이는 트리 들여쓰기).
  - 앱 기동은 시험으로 확인하지 못했다. mls 컨텍스트를 띄우는 시험(`JobAgentWiringTest`)이 Flyway 접속에서 먼저 실패하기 때문이다. 대신 리뷰에서 바꾼 뒤의 `mls.war` 를 바이트코드 문자열로 훑었다. `WEB-INF/lib`·`WEB-INF/lib-provided` 의 jar 118개와 `WEB-INF/classes` 에서 `org/jsoup`·`org.jsoup` 참조는 0건이다(`Class.forName`·`@ConditionalOnClass(name=…)` 문자열도 여기에 잡힌다). 같은 방법으로 `jsoup-1.23.2.jar` 를 훑으면 3212건이 잡혀, 방법이 동작함을 확인했다.
- 영향 범위: mls.war 에서 jsoup jar 가 빠진다. mls 를 의존하는 빌드가 없어(루트 `settings.gradle` 의 include 만) 다른 모듈에는 영향이 없다. 다른 레인과 겹치는 파일은 없다.
- 되돌리는 방법: 이 커밋을 revert 한다. 카탈로그 항목을 유지했으므로 revert 만으로 원래대로 돌아간다.
