# memo dn-split-dev (정본)

- 레인: dn-split-dev · branch chore/dn-split-dev · 조정 dmes-standard-87 · 지시 dn-split-dev-1
- 대상: dflow-merge · poll · dev · work · export SKILL.md 구조 분리 (규칙 이동만, 삭제 없음)

## 바이트 (SKILL.md / references 합계)
| 스킬 | SKILL.md 전→후 | % | references 전→후 | 목표 |
|---|---|---|---|---|
| merge | 26938→10076 | −62.6% | 44648→67380 | ≤10KB 달성(10,000 기준 +76B) |
| poll | 12916→8370 | −35.2% | 0→7615 | ≤8KB 에서 +178B |
| dev | 13859→11402 | −17.7% | 270685→275652 | 미달: 남은 건 모두 매 호출 규칙 |
| work | 14843→7562 | −49.1% | 73112→83037 | 달성 |
| export | 8733→8036 | −8.0% | 0→1216 | 달성(8,192 기준) |
- SKILL.md 합계 77289→45446 (−41.2%). references 합계 388445→434900(+46455) 증가분은 이동(문서 전체는 늘지 않고 규칙은 그대로, 포인터·헤딩 분만 증가).

## 절 분류·이동
- merge: 절차 1·2번→references/sweep-scan.md · 3·4번·트레일러 고정·결정 번호/마이그레이션 실행 규칙→merge-exec.md · 방언 검증 규칙 머리→dialect.md · 위치 선언→rationale.md · SKILL.md 에 stub 절 유지(scripts/*.sh 주석 인용 보호)
- poll: 위임 플래그 세부·위치 선언·지원 환경→delegation-tags.md · exit 9/10 근거·claim exit 4·exclude 사유·승인/반려 감지→exclude-and-detection.md · 기동 기본값·오류 종료 코드·충돌 감지 질문 금지→operations.md
- dev: 상태 모델 필드·phase 값·exit 10/12→references/state-model.md · --only·대상 저장소→references/rare-cases.md (마이그레이션 done 요약 줄은 orch/close.md 에 포인터)
- work: 시작 설정·doctor 해석·프로필·목록 옵션·설계 선행/상태·taskdir·scaffold·heartbeat·watch·release→references/subcommands.md (--phase blocked 2줄은 SKILL.md 에 복귀)
- export: 알려진 제약→references/known-constraints.md

## 리뷰(opus/high) 지적 반영
- 누락 규칙 0. 트리거 결함 H1~H5·M1~M4 수정(unapproved 0건 머지, merge 3번 읽기 지시, exit 10/12 멈춤 문구 복귀, --phase blocked 복귀, script-details 강제 읽기 축소 등)
- 내부 포인터 전체 경로화(dflow-dev orch/*)

## 열린 건 (dn-wbsweb 레인 입력)
- 외부 인용(수정 안 함, 타 스킬): dflow-team/SKILL.md:1029,1033,1050,1061,1079 · dflow-team/references/{worker-prompt.md:178,resolve-prompt.md:212} · dflow-work/references/troubleshooting.md:169 · dflow-work/{dflow.example:21,dflow.local.example:26} · dflow-merge/scripts/*.sh 머리 주석 · dflow-dev/references/dev-discipline.md:225,241,443,453 · docs/mdm/tasks/TSK-06-0{1,3}/design.md
- wbs-web tests/skills: dflow-sweep-check.test.ts 는 셸 블록을 SKILL.md 에서 찾음→sweep-scan.md 로 변경 필요. dflow-merge-remote/dialect-check/merge-decisions/row-g-evidence/force-progress 도 문장 대조 영향
- dflow-export SKILL.md:20 → dflow-wbs/references/dflow-integration.md (dn-split-wbs 머지 뒤 유효)
- docs/dflow-node-1010/baseline-bytes.txt·bytes-table 은 이전 크기 기준
