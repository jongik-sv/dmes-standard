# dn-work 레인 메모 (dflow-node-1010)

지시 dn-work-1. dflow-work 스크립트 sh → node 전환. 브랜치 chore/dn-work, 기준 dev 5d5e25c3c.

## 상태 (2026-10-10)

완료 — 커밋 5개, 머지 요청 전달·대기 중.

| 커밋 | 내용 |
|---|---|
| 5b0acf2d7 | dflow-config.mjs 이식 (원본 195줄) |
| c0a5c00cf | dflow-lease.mjs 이식 + POSIX cksum 구현 |
| df7ad9880 | dflow.mjs 이식 (원본 1080줄) |
| 7b7e8e8c3 | 원본 sh 6개 git mv backup/ + README |
| ee8612874 | 조정 리뷰 지적 반영 (config 7건·lease 7건) |

## 확인 결과

- node --check 3파일 OK, --help 사용법·종료 코드 출력(exit 2, 원본과 동일)
- config --source·tasks-dirs·projects·branch dev·config dev_branch — sh 판 실행 결과와 동일 출력
- config pats → SECRET 거부 exit 2
- POSIX cksum: 실제 cksum 과 6케이스 일치. 옛 dflow-lease.sh 의 lease_holder 전체 값(machine-id:3328267138) 동일. 목록 캐시 파일명 last-list-2619468087.json 이 기존 sh 판 생성 파일과 동일(캐시 승계)
- 쓰기 API 명령(claim·report·watch·lease acquire 등)은 사용자 지시대로 실행 안 함

## 설계 결정

- dflow-config.mjs·dflow-lease.mjs 는 순수 모듈(dflow.mjs 가 import). lease 는 ctx 주입으로 순환 import 회피
- heavy 호출: dflow-dev/scripts/heavy.mjs 우선, 없으면 heavy.sh(bash). 윈도우는 heavy.mjs 만. DFLOW_HEAVY_SH env 이름 유지(확장자로 실행기 판정)
- 레거시 .env 는 종전 source 대신 파싱(export 접두 제거·값 전체 따옴표 벗김) — 값을 실행하지 않는다
- apiRaw 는 {rc, body, err} 반환·출력하지 않음: claim·build-start·design-*·console-ack·lease 가 본문을 판정한 뒤 재출력
- pickToken 실패 = stderr 사유 + null(프로세스 무사) — profiles·doctor 가 죽지 않는다(원본 서브셸 대응)
- pickToken·apiRaw 등 dflow.mjs 사용자 안내 문구 중 dflow.sh 표기는 dflow.mjs 로 갱신(사람용 안내, grep 접두어 아님)

## 호출 경로 변경표

| 옛 | 새 |
|---|---|
| `bash .claude/skills/dflow-work/scripts/dflow.sh <인자>` | `node .claude/skills/dflow-work/scripts/dflow.mjs <같은 인자>` |
| `dflow.sh` 가 `. dflow-config.sh` source | `dflow.mjs` 가 `./dflow-config.mjs` import |
| `dflow.sh` 가 `. dflow-lease.sh` source | `dflow.mjs` 가 `./dflow-lease.mjs` import |
| `tests/console-cmds.sh`·`lease-refs.sh`·`watch-summary.sh` | `backup/tests/` 이동(퇴역·실행 금지) |

스크립트 외 호출자는 dflow-work 스킬의 .md 문서뿐(SKILL.md·README.md·references/*·dflow.local.example) — 문서 레인(dn-docs-*)이 위 표로 치환.

## 남은 순서

1. 머지 허가 → 메인 체크아웃에서 --no-ff 머지 → 머지 완료 보고
2. 워크트리 정리(git worktree remove·branch -d) → 정리 완료 보고

## 후보 후속 (조정 세션 재량)

- exit 7(design_state_404·BUILD_START_UNSUPPORTED) 경로·watch 요약 칸·console-* 의 서버 실응답 대조는 회차 끝 조정자 전체 확인 회차에서 (사용자 지시: 과도한 시험 금지)
- dflow.mjs 안내 문구 dflow.sh → dflow.mjs 갱신은 했으나 .md 문서 표기는 문서 레인 몫
