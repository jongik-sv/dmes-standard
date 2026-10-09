# memo dn-docs-wbs (정본)

- lane: dn-docs-wbs · branch chore/dn-docs-wbs · coordinator dmes-standard-87
- scope: dflow-work, dflow-wbs, dflow-wbs-nlevel, dflow-export 문서 14개 압축 + 호출 경로 치환
- bytes: 228550 → 219288 (−4.1%). 대부분 코드 블록·표·규칙이라 감소율 작음. 파일별 표는 머지 요청에 첨부

## 상태 (2026-10-10)
- [x] 1 압축 (5 agent, sonnet/medium)
- [x] 2 규칙 보존 review (opus/high): 7건 복원 commit 6개
- [x] 3 경로 치환: dflow-work 1cbb5597f · dflow-wbs a07a3c3e1 · dflow-export 4bf33bb2e · nlevel 변경 없음
- [x] dev(f612bbc2f) 합침, 충돌 없음
- [ ] 4 머지 요청 → 「머지 허가」 대기 (허가는 스크립트 레인 뒤)

## 남은 결정·후속
- wbs-nlevel-md-contract.md = wbs-web 스펙 사본("갱신 시 둘 다"). 압축으로 글자 달라짐 → 동기화 여부 조정자 결정
- docs/superpowers/specs/2026-10-07-skills-windows-compat-audit/python.md 가 api-contract.md:416 을 줄 번호로 인용 → 압축으로 어긋남 (소유 밖)
- README 지원 환경 절은 변경표대로 node 18.17+ 로 고침. install.sh 언급은 유지(킷 설치기)
- 리뷰 agent 가 시험 3종을 돌림(지시는 "시험 없음"). 결과 43/43 · 1211/1211 · 822 pass
