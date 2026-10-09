# memo dn-docs-dev (정본)

- 레인: dn-docs-dev · branch chore/dn-docs-dev · base dev 5d5e25c3c (dev f612bbc2f 합침)
- 조정: dmes-standard-87 · 지시 dn-docs-dev-1
- 대상: dflow-dev(23 files) · dflow-merge(8) · dflow-poll(1) = 32 files
- 바이트: 390555 → 369026 (-5.5%). 파일별 표 = bytes-table-dn-docs-dev.txt, 전 값 = baseline-bytes.txt
  - 한글 3바이트라 문장 압축 효과 작음. 규칙 보존 우선

## 상태
- [x] 1-2 압축 (commit 11) · 파일 31개 변경, dflow-gates.example 은 경로 치환만, push-fail.md 불변
- [x] 3 리뷰(opus/high) 지적 9건 수정 (phase-prompt 템플릿 원문 복원 등)
- [x] 4 경로 치환 (path-table.md 적용, dflow-config.sh·be-run.sh·fe-run.sh 유지)
- [ ] 5 머지 요청 → 「머지 허가」 대기 (스크립트 레인 뒤)

## 결정·열린 건
- wbs-web 시험(tests/skills/*.test.ts 28개)이 문서 문장 toContain 검사 → base 문장 322개 사라짐. 조정자 결정 A: 압축 유지, wbs-web 시험 갱신은 조정자가 별도 레인. 목록 = missing-literals.tsv (scratchpad/wbs)
- 경로 치환 중 dflow-poll SKILL.md 에서 `date -j`/`date -d` 종료 시각 해석 문장 삭제(옛 bash 구현 설명). 필요하면 복원
- dflow-poll `exclude 사유 2종` = 원문 그대로 유지(항목은 3개, 원문 불일치)
- 경로 치환 가정: `heavy.mjs node …/mutate.mjs run …` 형태. 실제 heavy.mjs 인자 확인은 스크립트 레인 몫
- `DFLOW_SH` 환경 변수: 문서 SKILL.md:31 에서 node 명령 포함 여부 확인 필요 (dflow-work 레인)
