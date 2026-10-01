# MDM 화면 성능 최적화 — 인계 (2026-10-01 퇴근 시점)

브랜치 `wip/mdm-screen-perf` (dev 0afccb3e 에서 분기). 아직 dev 에 병합하지 않았다.
요청: "MDM 의 다른 화면도 최적화" (속도·시스템 부하). 룰 세트 편집은 앞서 끝냄(713b552a, 5c8aded5).

## 끝난 것

### 프런트(m-mdm) — 수정·리뷰·테스트 완료
| 화면 | 내용 | 대표 수치 |
|---|---|---|
| dme/ruleEdit | 행별 직렬화·파싱 메모(WeakMap), diff base 1회 파싱, reorder Set, resequence 구조적 공유, 표시 행 캐시 | 200행 셀 편집 1회 parse 400→1, stringify 202→1 |
| dmd/dataItemMng | 작업 열을 `ItemActionCell` + 작은 저장소로 분리, 행 복제 재사용, 카테고리 훅 useMemo, 정규식 미리보기 300ms 디바운스(패널 닫힘 시 flush) | 셀 편집 3번 columns 재생성 3→0, compare 5→1 |
| dmc/codeItemEdit | 빈 이슈 갱신 생략, 행 복제 WeakMap(닫힌 행 제외), [코드 테스트] 탭에서만 compare(같은 기준이면 재호출 없음), 트리 계산 조건부, 카테고리 훅 useMemo | 코드 셀 렌더러 +140→+5 |
| dmc/codeMng, dmb/layoutMng, dma/domainMng | columns·data useMemo | 입력 한 글자마다 재생성 → 0 |

- 저장 뒤 전체 재조회(dataItemMng)는 하지 않았다 — 서버 정렬·필터·다른 사용자 변경 반영이 달라진다.
- 검증: `VITEST_MAX_WORKERS=2 pnpm vitest run tests/dme/ruleEdit tests/dmc tests/dmd tests/dmb tests/dma` 통과, `tsc --noEmit` 통과(퇴근 직전 기준).

### 백엔드(mdm lib/api) — SQL 수 감소
| 엔드포인트 | 전 | 후 |
|---|---|---|
| codeItemEdit/save 변경·추가 | 8+5n · 8+4n | 10+3n · 10+2n |
| dataCateEdit/save 소속 추가 | 5+6n | 10+n (잠금 1회) |
| dataEdit/view, dataCateEdit/search | 3+r | 일정 |
| headerMng/save | 33+24k | 41+11k |
| ruleEdit/view · execute | 22+2v · 9+v | 12 · 7 |
| ruleConfirm/validate | 30+3.5v | 28+v |
| headerMng.view · layoutMng.search(HEADER) · columnMng.view | 7+k · 3+2h · 2+t | 8 · 5 · 3 |

- 응답 동일성: 고치기 전·후 응답 스냅숏 파싱 비교 차이 0 (스냅숏은 로컬 scratchpad 에만 있었음, 커밋 안 함).
- 쿼리 수 테스트: `api/src/test/.../*QueryCountTest.java`, 공용 `common/perf/QueryCountProbe.java`, `dme/RulePerfFixture.java`.
- 하지 않은 것: dataItemMng 단건 쓰기(쿼리 수 이미 일정, 계층 판정 위험), termMng/save 응답 `list` 제거(`TermMngServiceTest:115` 가 읽음), confirm 의 변수당 +1(저장 검사 경로 I6).

## 남은 일 (순서대로)

1. **백엔드 전체 테스트 다시 돌리기** — 퇴근 직전 정리 작업(아래 2)을 중간에 멈췄다. `cd src/backend/mdm && ../gradlew :lib:test :api:test` (SQLite, 도커 금지). 정리 전 마지막 전체 결과: lib 1453 · api 1296 통과. 정리 뒤에는 대상 테스트(`*DataCateEdit*`·`*DataEdit*`·`*QueryCount*`, 50건)만 통과 확인했다. JDK 21 필요(`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`, 집 PC 는 그 PC 경로).
2. **정리 작업 확인** — 멈춘 에이전트가 이미 한 것: `DataEditService.resolver` 제거, 새 쿼리 수 테스트의 스냅숏 쓰기 제거, `MemberApplyRequest` javadoc, `DataCategorySegmentCore` 에서 `now` 를 잠금 앞으로 복원, R12 쓰기 도중 실패 롤백 테스트 추가. 확인 못 한 것: `DataCateEditService.java:192` 부근 javadoc("잠금이 모든 읽기보다 먼저"는 applyMembers 안 읽기 한정, `latestCate` 는 잠금 전 읽기) 수정 여부.
3. **헤더·레이아웃·룰 백엔드 변경 리뷰** — 리뷰 도중 멈췄다. 특히 `LayoutVersioner.record(Long)`·`LayoutSnapshotAssembler.read/fromDraft`·`LayoutDictionary.byPhysNames/views` 리팩터가 layoutMng save·validate·execute 에도 쓰이는데 전후 응답 비교 범위 밖이었다. I18(스냅숏 바뀐 전문만 새 버전), MAX 서브쿼리 최신 버전 조회, findAllById·IN 결과 순서를 본다.
4. **서버 재시작 후 브라우저 확인** — mdm 8096 은 옛 코드로 떠 있다. 재시작(`TSUP_DTS=0 local-run.sh --mdm -q` 계열) 뒤 ego-browser 로 ruleEdit·dataItemMng(정규식 편집 팝업)·codeItemEdit(닫힌 코드 보기·코드 테스트 탭)·headerMng 저장·layoutMng 를 확인.
5. **Local-Rules §19 보강** — 새로 쓴 재사용 패턴(ag-grid 가 행 객체에 직접 쓰므로 원본 대신 로드당 복제본 재사용, 훅 반환 useMemo, 미리보기 디바운스+닫힘 flush)을 짧게.
6. 커밋 정리 후 dev 병합·푸시(사용자 확인 뒤).

## 제외(사용자 확인 필요)
- OASIS `ruleSetRunner` 저장 세트 실행 경로 Session/prefetch — 지난번부터 대기 중.
- 용어 사전 캐시, layout 항목 delete+insert 전체 교체를 diff 반영으로 바꾸기 — 위험도 있어 보류.
