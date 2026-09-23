# TSK-05-01 머지 충돌 해소 기록

## 시도 1

- 기준(BASE): `origin/dev` `beb2650` · 머지 대상: `origin/agent/ae88277d-interface-layout-contract` `7b579d5`(merge-base `9a00856`) · 주문 `ae88277d-8bd0-4993-a035-7803c6c26b14`
- 처음 잰 기점은 `ea20dc9` 였으나, 머지 직전에 TSK-03-04 가 개발 브랜치에 들어와 `beb2650` 으로 옮겼다(기점 이동 1회). 기준선은 `beb2650` 에서 다시 쟀다.
- 충돌 파일 1개. 양쪽이 함께 고친 파일은 이것과 `ContractStubCompileTest.java`(자동 병합, 컴파일·시험 통과) 둘이다.

| 파일 | 규약 | 판단 |
|---|---|---|
| `docs/mdm/decisions.md` | R8(+R1 순서) | 양쪽이 D-038 뒤에 같은 번호 D-039~ 를 새로 붙였다(개발 브랜치 D-039~D-046: TSK-01-03, 이 브랜치 D-039~D-041: TSK-05-01). 개발 브랜치 항목은 번호·위치·본문을 그대로 두고, 이 브랜치의 세 항목을 그 뒤에 붙여 번호만 바꿨다(D-039→D-047, D-040→D-048, D-041→D-049). 본문은 한 글자도 바꾸지 않았다 |
| `docs/mdm/tasks/TSK-05-01/design.md` | R7 | 이 Task 폴더라 이 브랜치 판이다. 옛 D-039(예약어 인용 실측)를 가리키던 `decisions.md D-039` 세 곳(D1 근거, 변이 표 7행, 결론 문단)을 D-047 로 바꿨다. 그대로 두면 개발 브랜치의 D-039(TSK-01-03 버전 테이블 명세)를 가리키게 된다. design 내부 번호(D1~Dn)는 바꾸지 않았다 |

판단 근거:

- 이 브랜치의 D-040·D-041 은 decisions.md 밖에서 참조하는 곳이 없다(`git grep 'D-04[01]'` docs/mdm·src). 머지 뒤 남은 `D-039`~`D-041` 참조는 모두 TSK-01-03 쪽 문서이며 개발 브랜치 항목을 가리킨다.
- `docs/mdm/naming-dialect-rules.md` 는 텍스트 충돌 없이 자동 머지됐다(이 브랜치의 예약어 칼럼 행·#19 TSK-05-01 실측 문장). decisions 번호 참조가 없어 손대지 않았다.
- 의미 충돌 점검: 개발 브랜치가 merge-base 뒤에 더한 MSSQL 시험은 `VersionStateServiceMssqlTest`(TSK-01-03) 하나다. 이 시험은 픽스처 테이블 `TB_MDM_TC_*` 만 보며 Flyway 최신 버전이나 전체 테이블 목록을 단언하지 않는다. 이 브랜치의 V4 마이그레이션과 번호가 겹치는 mdm 마이그레이션은 개발 브랜치에 없다(mdm 은 V1~V3 뿐).

게이트 범위: 이 브랜치는 `src/frontend` 를 건드리지 않으므로(차이 0 파일) 수치 게이트는 백엔드 `./gradlew testAll --continue --rerun-tasks`(JUnit XML 의 testcase 수)로 판정했다.

게이트: 개발 브랜치 1853 · MERGE_HEAD 단독 581 · 결과 1878 (신규 실패 0, `GATE_PASS need=1853 total=1878`)

- 스위트별 총수(개발 브랜치 → 결과): aps-core 3→3, cactus-core 203→203, caravan-core 102→102, caravan-hub 78→78, maru-mdm-engine 1192→1192, mdm/api 57→73(+16), mdm/lib 218→227(+9).
- 보조(총수 밖): 머지 결과 트리에서 `mdm :api:mssqlMigrationTest`(Testcontainers MSSQL)를 돌려 46건 모두 통과했다(`VersionStateServiceMssqlTest`·`MdmInterfaceLayoutMssqlMigrationTest` 포함).
