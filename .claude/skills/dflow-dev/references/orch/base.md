# /dflow-dev 단계 — 착수 가능 판정과 기점

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

2. **착수 가능 판정 — 서버는 안 해줌.** claim 전 오케스트레이터가 직접:
   - **spec 검사**: show 의 `.order.item.spec` 이 비면 착수 불가.
     - 제목만으로 요구사항 지어내기 금지
     - 스킵하고 사유 보고
   - **선행 검사** (show 의 `depends_evidence[]` 각 원소 d). **완료 판정 = `head_sha` 존재가 아니라 서버 claim 게이트와 같은 축**: `stage >= im` **또는** `d.order_approved === true` 면 선행 완료.
     - 다른 축 쓰면 "게이트는 통과하는데 스킬은 막는" 상태가 됨
     - 재발행 겪은 선행은 현재 주문이 ready 여도 과거 승인 있으면 `order_approved` true. 현재 주문 status 로 판정하면 그 승인을 영영 못 봄
     - **v2.8: `d.waived === true` = **강제 진행 간선** (사람이 이 선행을 기다리지 않기로 면제).**
       - 완료 판정·기본 브랜치 반영 확인·스택 안 함
       - 「강제 진행: <선행> 은 스텁으로 대신한다」 한 줄 남김
       - 그 선행 계약(show 의 선행 spec·acceptance, 없으면 `dflow.mjs show <선행 ref>`)을 읽고 아래 「강제 진행 스텁 규칙」대로 스텁/목 배치 (Phase 프롬프트 `{FORCE_STUB}`)
       - 기점 = 항상 `origin/<기본브랜치>`. 면제된 선행에는 `head_sha` 없고, 승인 전 브랜치 위에 쌓으면 선행 반려 시 함께 무너짐
       - 대화형 = 행 G 갈래 1 처럼 로컬 선행 산출물 있으면 스택 가능. 팀원(워커) 모드 = 안 함(행 G)
     - **v2.3 서버는 판정 결과를 `d.reached` 로 줌** (= `stage ∈ {im,xx}` ∨ `order_approved` ∨ `actual_pct ≥ 100`).
       - **`'reached' in d` 면 그 값이 선행 완료 판정** — 축 재조합 금지 (서버는 통과시키는데 스킬만 막는 일 방지)
       - 키 없으면 아래 v2.2 규칙
     - `order_approved` 지원 여부 = **키 존재 여부로 판정** (`'order_approved' in d`).
       - `contract_version` 으로는 못 가름: 이 필드가 들어간 뒤로도 한동안 버전을 안 올려 2.1 서버 중 키를 주는 것·안 주는 것이 섞임 (2.2 부터 계약에 명시)
       - **키 없음 = 옛 서버: `false` 단정 금지. "판정 불가"로 갈라 stage 축만으로 판정하고 그 사실 한 줄 남김.**
     - 선행 완료 + `head_sha` 있음: `git fetch origin && git merge-base --is-ancestor <head_sha> origin/<기본브랜치>`
       - 거짓 = 선행이 main 미반영. **Phase 01-가 4번과 같은 절차로 지금 직접 merge** (Phase 01-가 가 `SWEEP_NONE` 으로 `/dflow-merge` SKILL.md 를 안 읽었으면 먼저 읽음)
       - 브랜치명 모르면 `<head_sha>` 를 그대로 merge 대상으로 써도 됨 (fetch 로 이미 origin 에 있음)
       - merge 후 이어서 진행
       <!-- worker:begin -->
       `--worker` 면 merge 안 하고 그 `head_sha` 를 기점으로 삼아 아래 claim 절차대로 스택(「--worker」 B).
       행 B·G 세부 = worker-mode.md 「행 G」 — 처음 닿을 때 `node .claude/skills/dflow-dev/scripts/sections.mjs .claude/skills/dflow-dev/references/worker-mode.md '행 G'` 로 읽음.
       <!-- worker:end -->
     - `head_sha` 없으면 갈래 셋으로 나눔 — **"선행 미승인" 하나로 뭉개기 금지** (뭉개면 틀린 전제로 스택을 쌓거나 착수를 포기하고, 오분류가 무음이라 아무도 못 알아챔):
       1. 미승인 + stage 미달 → 진짜 미승인. 선행 산출물이 로컬 `agent/` 브랜치에 실재하는지 확인.
          - **실재** → 미승인 위에 쌓는 리스크 보고 + 스택 브랜치(3번)로 진행
          - **부재** → **착수 불가**, 스킵하고 사유 보고 (입력 없는 산출 = 날조)
       2. `order_approved:false` 인데 `stage >= im` → 승인 버튼 안 거치고 단계 드롭다운으로 완료 처리된 것 (서버 가드는 `xx` 만 막고 `im` 은 안 막음). 진행하되 **반드시 한 줄 남김** — 서버가 못 막는 우회를 스킬이 최소한 드러냄.
          <!-- worker:begin -->
          `--worker` 면 갈래 1·2 스택 안 함. 갈래 1 = `skipped` 로 끝. 갈래 2 = 기본 브랜치 반영 확인될 때만 진행, 아니면 `skipped` 로 끝(「--worker」 G).
          <!-- worker:end -->
       3. `order_approved:true` 인데 `head_sha` 없음 → 승인됐으나 evidence 가 비었거나 주문 재발행으로 옛 완료 보고가 가려진 경우. 한 줄 남기고 진행.
   - **v2.9 설계 선행 후보**: `dflow.mjs contract-ge 2.9` exit 0 이면 `reached` 거짓인 선행(위 갈래 1)을 스택·착수 불가로 가르지 않고 **설계 선행 후보**로 둠.
     - 아래 claim 을 `--design-first` 로 하고 그 출력으로 모드 결정(「설계 선행」 1)
     - 기점 계산에서 그 선행 제외 (코드 아직 없음)
     - 선행이 구현 전(`as`·`ds`·미착수)인지는 스킬이 판정 안 함 — 서버가 거부 (exit 4 + `DESIGN_FIRST_TOO_EARLY`)
     - exit 1(옛 서버)이면 위 갈래 그대로
   - **강제 진행 스텁 규칙**(스펙 2026-09-23 §3.4):
     1. 후행 소유 경로에 둠 — 선행이 만들 파일을 먼저 만들지 않음. 예: `src/__stubs__/<선행 TSK-ID>/order.ts` 에 계약대로 쓰고 주입 지점 한 곳에서만 바꿔 끼움. 공유 등록 목록의 같은 줄은 고치지 않음.
     2. 테스트에만 필요하면 테스트용 목으로 끝내고 런타임 스텁 만들지 않음.
     3. 런타임 스텁에는 계약에 맞는 고정 응답을 넣어 후행 테스트가 개발 브랜치에서 통과하게 함.
     4. 표식: 코드에 `FORCE-STUB: <선행 TSK-ID>` 주석. design.md 와 완료 보고에 「강제 진행 스텁」 절(대신한 선행·대상·가정한 계약).
     5. 완료 보고 뒤 승인은 스텁 제거 하위 Task(`<후행 ref>.stub.<선행 ref 치환>`) 끝날 때까지 잠김 — 정상.
     6. 스텁 제거 하위 Task 를 맡으면: `git grep -n 'FORCE-STUB: <선행 TSK>'` 0건 + 후행 테스트가 실구현 상대로 통과해야 완료. 실구현 상대로 실패하면 계약 어긋남으로 보고 (스텁 고쳐 통과시키기 금지).
   판정 통과 후 **기점 결정 → 그 기점으로 이동 → claim.** claim 의 선행 도달 검사(dflow.mjs `check_depends_local`)가 현재 HEAD 를 보기 때문. 기점 규칙 = 3번과 같음.
   - 기본 = `origin/<기본브랜치>`
   - 선행이 main 미반영이거나 미승인 스택이면 선행 산출물 있는 agent 브랜치(또는 그 `head_sha`)
   - 선행이 여럿이면 기점이 모든 선행 `head_sha` 를 조상으로 가져야 함 (`git merge-base --is-ancestor <선행 head_sha> <기점>` 전부 참). 그런 기점이 없으면 착수 불가로 스킵하고 사유 "선행을 모두 조상으로 갖는 기점 없음" 보고.

**다음 단계**: 새 claim 이면 `orch/claim.md`. `orch/design-first.md` 「3」 2 에서 기점 재판정으로 왔으면 그 자리로 복귀.
