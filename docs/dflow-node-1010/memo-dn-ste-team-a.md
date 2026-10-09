# memo dn-ste-team-a (정본)

- lane dn-ste-team-a · branch chore/dn-ste-team-a · coordinator dmes-standard-87 · 지시 dn-ste-team-a-1
- 대상: dflow-team SKILL.md + references/{args,lead-state,start,wake,result-handling,sweep,spawn,blocked-seat,design-state,design-ahead,resume,issues,second-lead,extend,events,closing,help}.md
- 크기: 18 files, 원본 합계 약 250 KB → D3 (agent 5, sonnet/medium), SKILL.md 는 scratchpad 에서 A/B 두 반으로 나눠 압축 뒤 합침
- 원본 사본: scratchpad/orig (bytes 비교용)

## 순서
1. agent 압축 (A: SKILL 1-485, B: SKILL 486-999, C/D/E: references)
2. 검증 스크립트: code block·heading·`team.*`·`{…}` 보존 diff
3. commit 1-3 files 단위
4. opus/high 규칙 보존 리뷰 → fix
5. dev merge → 머지 요청

## 상태
- 압축 2회전 + opus 리뷰 반영 완료, dev merge 끝. 합계 246,981 → 237,845 B (-3.7%). 머지 요청 전송, 허가 대기
- 절감 작은 이유: 남은 바이트 대부분 code·backtick·「제목」·protocol 문구(보호 대상). 시험 spawn 은 test 아닌 probe 뜻이라 유지
