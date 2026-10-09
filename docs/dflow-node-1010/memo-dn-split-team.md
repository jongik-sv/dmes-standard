# memo dn-split-team (정본)

- 레인: dn-split-team · branch chore/dn-split-team · 조정 dmes-standard-87 · 지시 dn-split-team-1
- 대상: .claude/skills/dflow-team/SKILL.md (136,384 B → 목표 ≤ 45 KB) + references 신규·추가
- 수정 크기: SKILL.md 1378줄 전체 재구성(D3, 스크립트 조립) · 신규 references 7개 · args.md 끝에 추가 1곳

## 1. 절 분류 (원본 바이트)

| 절 | B | 분류 | 처리 |
|---|---|---|---|
| 머리말(1-35)·참조 표·정의 | 3.3K+2.6K | 매 호출 | 유지(참조 표만 새 행 추가) |
| 인자 | 12.3K | 인자 해석 = 매 호출 | 요약 유지, 상세(키 판정 표·도커·WP·resume·automerge·시각 정규화) → args.md |
| 팀장 상태 | 17.2K | 압축 뒤 재독 세트 | 압축 뒤 첫 기상·핵심 요약 유지, 재구성 스캔·복원·고아 스캔 상세 → lead-state.md |
| 두 번째 팀장 / 0. 환경 감지 | 0.3K / 1.2K | 분기 | 유지 |
| 1. 시작 | 18.0K | 진입. 단 전제 검사 블록·잠금·lease 명령은 시작 때 한 번 | 순서·시작 보고·정의 유지, 블록 전문 → start.md |
| 2-1 poll / 2-2 감시 루프 | 3.6K / 5.1K | 핵심 루프 | 명령·기상 사유 표 유지, 플래그 설명·TICK 건너뛰기 상세 → wake.md |
| 2-3 기상마다 | 18.5K | 핵심 루프(재독 세트) | wake 명령·처리 순서·기상 표 유지(poll exit 0 행은 축약), 재개 요청·LEASE/LOCK 상세·show 필터·선행 사전 검사·대기 jq → wake.md |
| 2-4 이슈 보고 | 0.7K | 분기 | 유지 |
| 3. 결과 처리 | 19.0K | 핵심 루프(재독 세트) | 결과 줄 찾기·핵심 status 행·회수·차단기 유지, 생존 증거·문제 기록·희귀 status 행·무응답/정지/대기/재시작 판정 → result-handling.md |
| 4. 승인 스윕 / 4-0 / 4-1 | 8.6K / 3.4K / 0.8K | 호출 규칙 = 핵심, 결과별 처리 = 특정 상황 | 호출 규칙·결과 요약 유지, 반려·경합·push 실패·충돌·decisions·방언·머지 자리 → sweep.md |
| 5. 팀원 spawn / 5-1 / 5-2 / 5-3 | 8.4K / 1.1K / 1.2K / 3.4K | spawn 은 핵심, 블록·세부 = 특정 상황 | 포인터 고정 문구·재spawn 여섯 유지, 단계 상세·입장 제어 기준 → spawn.md |
| 6. blocked / 좌석표 연동 | 2.6K / 1.4K | 특정 상황 | 요약 유지, 전문 → blocked-seat.md |
| 7. 마감 / 금지 | 0.5K / 2.8K | 금지·분기 | 유지 |

## 결정 (기본안, 조정에 질문 중)
- 「특정 상황」만 옮기면 약 63KB. 45KB 는 못 맞춘다 → 기본안 = 핵심 루프 절(2-3·3)의 서술까지 요약으로 줄이고 상세를 references 로 옮긴다. 옮긴 「매 호출」 성격 절은 머지 요청에 명시.
- 원본 줄은 한 줄도 버리지 않는다. SKILL.md 에서 빠진 줄은 references 에 글자 그대로 옮기고, SKILL.md 요약은 「정본 = references …」 로 표시.
- 제목·번호 유지: 원래 `##`·`###` 제목은 모두 stub 으로 남김(다른 파일·스크립트가 「2-3」·「5-3」 등으로 가리킴).

## COMPACT_REREAD
- dn-team 의 wake.mjs 도 같은 sed 앵커(`**참조**`~`## 두 번째 팀장`, `## 2. 기상과 감시`~`## 4. 승인 스윕`)를 씀. 이 네 제목은 글자 그대로 유지.
- 재독 세트 안 본문이 줄어들므로, 압축 뒤에는 요약 + 「참조」 표만 돌려줌. wake 변경 제안은 완료 뒤 이 메모 끝에 기록.

## 결정 갱신 (조정 답, 10-10)
- A 채택 안 함. B 기준 + 핵심 루프·진입·인자 절 안의 드문 분기만 추가 이동. 45KB 는 참고치. 「무조건 cat」 로 옮긴 절은 호출마다 다시 읽히므로 토큰 절감 0.
- 그래서 전제 검사 블록(8K)·기상 표·status 핵심 행·spawn 포인터·금지 등은 SKILL.md 에 남김. 결과 99,892 B(−26.8%, 리뷰 반영 후). 45KB 까지 더 줄이려면 문장 압축이나 전제 검사 블록 이동이 필요(후자는 매 시작 cat 이라 절감 0).

## 바이트 (전→후)
| | 전 | 후 | 변화 |
|---|---|---|---|
| SKILL.md | 136,384 | 99,892 | −36,492 (−26.8%) |
| references 전체 | 313,138 | 371,727 | +58,589 |
| 합계 | 449,522 | 471,619 | +22,097 (+4.9%) |
- 합계가 늘어난 이유: 새 파일 머리말·SKILL.md 요약·「참조」 표 행이 사본으로 남음. 읽는 양이 아니라 매 호출 실리는 SKILL.md 가 목표.

## 옮긴 절 (원문 그대로, 위치 → 새 위치)
- 인자: 도커 세부(141-145)·--resume 세부·WP 세부·자동 머지 세부 → references/args.md 끝 「인자 전문 …」
- 팀장 상태: 복원 규칙(241-268)·고아 스캔~부트스트랩(288-344) → references/lead-state.md
- 1. 시작: scaffold 블록(520-534)·3번 서버 claimed 대조(538-548)·절전 방지(581-588) → references/start.md
- 2-2/2-3: TICK 건너뛰기·resume_requests·LEASE_KEEP_DEAD·선행 사전 검사/대기 설명·선행 반영 사전 검사 → references/wake.md
- 3. 결과 처리: 생존 증거·문제 기록·status 표 나머지 행(design_*·failed permission/rate-limit/no-result/not-isolated/project/not-assignee/deps·cancelled)·중단/무응답/정지/대기/재시작 → references/result-handling.md
- 4. 승인 스윕: 결과별 처리(반려·경합·push 실패·충돌·decisions·방언·머지 자리·재-detach)·4-0 의 3·4번 → references/sweep.md
- 5. 팀원 spawn: 5번 tmux·Orca 단계·5-2 세부·5-3 알림·기준값 → references/spawn.md
- 6. blocked 답 매칭·좌석표 연동 → references/blocked-seat.md
- wbs-web tests/skills 가 SKILL.md 문장을 toContain 하면, 위 절 문장은 이제 references 쪽에서 찾아야 함(전체 줄 보존 확인됨, 요약 문장만 새로 생김).

## 리뷰(opus/high 1회) 반영
- high: 무응답 자동 정리 요약이 restart.md 와 어긋남 → 재시작 후보는 team.lost, 그 밖만 자동 정리로 고침 / 정본 스캔 블록이 재독 세트 밖 → SKILL.md 로 복귀
- med: 키 판정 표·선행 대기 jq 블록 SKILL.md 복귀, push 실패 갈래(경합·연결·권한=멈춤 / 훅=사람 머지 / 충돌=계속)·일시 제외 해제 조건·resume_requests 두 규칙·status 합친 행 제외 칸·detached 재-detach 명령 보강
- low: 참조 표 트리거 구체화, 옮긴 문서와 다른 문서의 낡은 포인터 정리
- 모호 인정: 문제 기록 블록(결과마다)·생존 증거(TICK마다)는 references 에 있어 해당 때 cat — 이득 작음, 트리거로 명시

## COMPACT_REREAD
- sed 앵커 4개 불변(36·260·486·753행). 재독 세트 79,580 B → 55,820 B. 정본 스캔·선행 대기 jq·기상 표·status 핵심 행이 재독 세트에 남아 wake 변경 불필요.
- 보강 제안(선택): 압축 뒤 첫 기상에 lead-state.md 「복원 규칙」·「고아 스캔」을 읽게 하려면 COMPACT_REREAD 끝에 cat 추가 가능. 필수 아님.

## 조정에 알릴 것
- 45KB 미달(99.9KB). 이유: 전제 검사 블록(8K)·기상 표·status 표·spawn 포인터 등 매 호출 절은 남김(조정 지시 B). 더 줄이려면 문장 압축(별도 pass).
- scripts(.sh/.mjs) 주석이 SKILL.md 절 번호를 가리킴(capacity 5-3, tick 3, lead-state 팀장 상태 보조, wake 2-3). 제목·번호는 유지했으므로 변경 불필요하나, tick 의 「3」 생존 증거 언급은 이제 references/result-handling.md 에 있음.
- wbs-web tests/skills: 이동한 절 문장은 references 쪽 검색 필요. 위 「옮긴 절」 목록이 입력.

## 상태
- [x] 1 분류표 · [x] 2 이동 · [x] 3 리뷰 반영 · [x] 기계 검사(원본 비공백 줄 존재, 코드 블록 33/33, 의도한 포인터 수정 9줄만 차이)
- [ ] 4 머지 요청 → 「머지 허가」 대기
