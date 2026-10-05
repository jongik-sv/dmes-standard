# scripts/perf/mdm-meta — MDM 메타 BE 응답 측정

`run-measure.sh` 는 curl 로 mcm 메타 조회와 MDM 메타 피드의 응답 시간·크기를 잰다. 서버·DB 는 읽기만 한다.
조정 세션이 측정 창에서 돌린다. 같은 설정 벤치도 2배까지 흔들리므로 반복 측정 없이 결론 내지 않는다.

## 측정 쌍

| 쌍 | 대상 | A(기준) | B(변경) | 보는 것 |
|---|---|---|---|---|
| `mcm` | `POST {MCM_BASE}/api/mcm/mdmMeta/columns` | 표준 물리명 177개(`names-std.txt`) | 별칭 이름 138개(`names-alias.txt`) | 표준 경로와 별칭 경로의 응답 시간·크기 |
| `feed` | `POST {MDM_BASE}/api/mdm/oasis/metaFeed/view`(COLUMN) | 별칭 이름 138개, `systemCode=MES` | 같은 이름, `systemCode=MES,MDM` | 시스템 코드 목록(C1b)이 피드에 더하는 비용과 피드 크기 |
| `screen` | mcm 메타 조회 | 화면 키 417개(`scripts/mdm-meta/keys-2026-10-05.txt`) | A 와 같은 요청 | 같은 요청의 흔들림 폭(A·B 차이가 잡음 크기) |

- `names-std.txt`: 분류표의 사전에 있음·신규·별칭·MDM 별칭 행이 가리키는 표준 물리명.
- `names-alias.txt`: 같은 행들 중 화면 키가 표준 물리명과 다른 것(MES 별칭 71 + MDM 별칭 67).
- 등록 전에는 별칭 이름이 대부분 missing 이라 `mcm` B·`feed` 의 hit 가 작다. 등록·C1b 뒤 hit 가 늘어난 상태로 다시 잰다.

## 방법

- 첫 회차 앞에 쌍마다 A·B 를 한 번씩 불러 워밍업한다(mcm 캐시 적재·JIT). 이 값은 결과에서 뺀다.
- 회차마다 `uptime` 의 load 1·5·15분 값을 남긴다. A·B 순서는 회차마다 뒤집는다(홀수 A→B, 짝수 B→A).
- 회차 안에서 한 쪽을 `--reps` 번(기본 7) 연달아 부르고 그 중앙값을 회차 값으로 쓴다. 요약은 회차 값들의 중앙값·최소·최대다.
- ms 는 curl `time_total`(로컬 루프백, 요청 시작 ~ 응답 끝), bytes 는 응답 본문 크기, hit 는 응답 `items` 수다.

## 실행

```bash
# 등록 전(지금)
scripts/perf/mdm-meta/run-measure.sh --rounds 5 --tag before
# MDM·mcm 재기동(C1b)과 등록 뒤
scripts/perf/mdm-meta/run-measure.sh --rounds 5 --tag after
```

결과는 `${TMPDIR:-/tmp}/dmes-perf/mdm-meta/<tag>-rounds.tsv`(회차별)·`<tag>-summary.tsv`(요약)다. `--out` 으로 폴더를 바꾼다.
환경 변수 `MCM_BASE`(기본 `http://localhost:8100`)·`MDM_BASE`(기본 `http://localhost:8096`)·`BACKEND_CLIENT_KEY`(기본 로컬 값).

2026-10-05 동작 확인(1회차·2회, 측정 아님): 모든 쌍이 HTTP 200 으로 끝났다. 실행 중 MDM 은 C1b 전이라 `feed` 는 A·B 모두 hit 0 이었다(같은 이름을 `systemCode=MDM` 으로 부르면 67건 hit).
