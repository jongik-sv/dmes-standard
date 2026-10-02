# MDM 자체 컬럼 사전 등록 (2026-10-01)

MDM 모듈이 자기 테이블(`TB_MDM_*` 39개)에서 쓰는 물리 컬럼 198개를 용어·컬럼 사전에 등록한 기록이다.

| 파일 | 내용 |
|---|---|
| `decisions.json` | 물리명마다 기존 표준 컬럼에 붙일지(map 41)·새로 만들지(new 143)·같은 새 컬럼을 쓸지(same_as 14) 판정한 결과와 새 용어 30·새 도메인 3·별칭 19, 남은 질문 |
| `apply_mdm_self.py` | `decisions.json` → `src/backend/data/mdm.db` 적재. 다시 돌려도 결과가 같다. 적재 전 백업, 외래 키·누락 검사 |
| `last-run.txt` | 마지막 실행 결과 |

- 등록 모델: 표준 컬럼(`TB_MDM_COLUMN`) + 시스템별 필드(`TB_MDM_COLUMN_SYSTEM`, `SYSTEM_CODE='MDM'`). 한 필드명은 표준 컬럼 하나에만 붙인다(02-term-domain-column.md 912행). 테이블마다 뜻이 갈리는 이름은 대표 뜻 하나를 고르고 나머지는 NOTE 에 적었다.
- 감사 컬럼: C_AT·U_AT·C_PGM_ID·U_PGM_ID·C_USR_ID 는 레거시 프레임워크 감사 컬럼이 이미 붙은 기존 컬럼(74·75·78·76·5368)에 붙였다. ISSUES.md §5 의 A/B안이 정해지면 그 컬럼과 함께 옮긴다.
- 새 용어·컬럼의 SRC_ORIGIN 은 `MDM 자체 스키마 2026-10-01`, 감사 C_PGM_ID 는 `apply_mdm_self` 다.
- 판정은 원천 설계서 02~08 을 근거로 서브에이전트(opus) 2개가 나눠 하고, 메인이 공용 결정·병합·검증을 했다.
