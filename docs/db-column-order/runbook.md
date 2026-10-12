# DB 컬럼 순서 반영 런북

`col-order-gen` 레인 산출물을 DB 에 반영하는 절차다. 규칙과 결정은 [README §0](README.md#0-확정-규칙-사용자-결정-10-1110-12) 을 따른다.

## 1. 무엇이 바뀌었나

| 종류 | 파일 | DB 에 미치는 영향 |
|---|---|---|
| V1 다시 쓰기 | 각 스키마 `V1__baseline.sql`(mcmapuser·mcaapuser·mcm_backup·mcm_source·mdm·caravanuser·ifuser) | `create table` 의 컬럼 줄 순서만 바뀜. 새 DB 만 영향. 기존 DB 는 **체크섬만** 달라진다 |
| 재배치 V 파일 | mcmapuser `V16`·mcaapuser `V3`·mcm_backup `V3`·mcm_source `V3`·mdm `V10`·caravanuser `V2`·ifuser `V2` (`__column_order.sql`) | 비-PK 컬럼을 규칙 순서로 `INVISIBLE` → `VISIBLE`. 데이터·타입·NULL·기본값·제약·인덱스는 그대로. 다시 적용해도 결과가 같다 |
| 도구 | `scripts/db-order/`(생성기·검사·`verify-db.mjs`), `scripts/oracle/pdb.mjs repair`·`migrate` | — |

aps-core·mls·mpn·mpp·mqc 는 이미 규칙 순서라 바뀐 파일이 없다.

- 새 DB(V1 부터 적용): V1 이 규칙 순서로 만들고, 뒤 V 파일이 더한 컬럼은 재배치 V 파일이 제자리로 옮긴다.
- 기존 DB: 바뀐 V1 체크섬을 이력에 맞춘(repair) 뒤 재배치 V 파일만 새로 적용된다.

## 2. 반영 순서(조정자)

머지 뒤 아래 순서로 한다. 각 단계는 PC 잠금·열린 PDB 상한(3)을 지킨다.

1. **메인 BE 를 멈춘다.** 재배치 중에는 컬럼이 잠깐 숨으므로 `SELECT *` 를 쓰는 화면·동기화(CommSyncMng)가 그 사이 돌지 않게 한다.
2. **L_MAIN**: 아래 §3 의 PC 절차(repair → migrate → 확인).
3. **TPL_SCHEMA·TPL_DATA 다시 만들기**: 새 V 파일로 만들어야 이후 복제본이 규칙 순서다.
   ```
   node scripts/oracle/pdb.mjs template-schema TPL_SCHEMA --rebuild
   node scripts/oracle/pdb.mjs template-data TPL_DATA --rebuild
   ```
   다시 만들 수 없는 사정이면 `template-unseal` → §3 절차 → `template-seal` 로 대신한다. `TPL_EMPTY`(사용자만 있음)는 그대로 둔다.
4. **메인 BE 를 다시 띄운다.** 이력이 맞춰져 있어 Flyway 가 할 일이 없다(§3 에서 migrate 를 건너뛰었다면 이때 앱 Flyway 가 재배치 V 를 적용한다).
5. 각 PC·레인에 §3 안내.

## 3. PC 절차(기존 PDB 하나)

`<PDB>` = `L_MAIN`·`L_<레인>` 등. 먼저 그 PDB 를 쓰는 BE 를 멈춘다.

```
node scripts/oracle/pdb.mjs open <PDB>                 # 닫혀 있으면
node scripts/oracle/pdb.mjs repair <PDB> --dry-run      # 고칠 행 확인: 바뀐 V1 만 나와야 한다
node scripts/oracle/pdb.mjs repair <PDB>                # 바뀐 V1 체크섬만 이력에 맞춤(다른 행 무변경)
node scripts/oracle/pdb.mjs migrate <PDB> --dry-run     # 적용할 파일 확인: 재배치 V(+ 그 PDB 에 아직 없던 V)만 나와야 한다
node scripts/oracle/pdb.mjs migrate <PDB>               # 재배치 V 적용(앱 기동으로 대신해도 된다)
node scripts/db-order/verify-db.mjs <PDB>              # 규칙 순서·INVALID 객체 0·함수 기반 인덱스 정상 → exit 0
```

- `repair` 를 건너뛰고 BE 를 띄우면 Flyway 검증이 `Migration checksum mismatch` 로 기동을 막는다. 순서를 지킨다.
- `migrate` 대신 BE 기동으로 적용해도 결과는 같다. 단 스키마마다 Flyway 를 도는 앱이 달라서 그 스키마의 앱을 띄워야 적용된다. `pdb.mjs migrate` 는 전 스키마를 한 번에 적용한다.
- 레인 PDB 를 다시 만들 수 있으면 위 절차 대신 새 `TPL_DATA` 에서 다시 복제해도 된다(`drop` → `clone TPL_DATA <PDB>`).

### 중간에 실패했을 때

DDL 은 자동 커밋이라 재배치 V 가 중간에 멈추면 일부 컬럼이 `INVISIBLE` 로 남을 수 있다(데이터는 그대로다). 원인을 고친 뒤 같은 재배치 V 파일을 다시 적용하면 된다(멱등).
- `pdb.mjs migrate` 로 적용하다 실패했다면 이력 행이 없으니 다시 `migrate` 한다.
- 앱 Flyway 로 적용하다 실패했다면 이력에 실패 행이 남는다. 실패 행을 지운 뒤(`flyway repair` 또는 해당 `flyway_schema_history` 행 삭제) 다시 기동한다.
- 숨은 컬럼 확인: `select table_name, column_name from user_tab_cols where hidden_column = 'YES' and user_generated = 'YES';`

## 4. 운영·개발계(WildFly, Flyway 끔) DBA 안내

- **새로 까는 DB**: 지금처럼 스키마마다 `V1` 부터 번호 순서대로 적용한다. 마지막 재배치 V 파일까지 적용하면 규칙 순서다.
- **이미 V1~ 를 적용한 DB**: 바뀐 V1 은 다시 적용하지 않는다(내용은 컬럼 순서만 다르다). 그 DB 에 적용한 마지막 V 파일 다음부터 차례대로 적용하면 재배치 V 파일이 마지막에 돌아 규칙 순서가 된다.
- Flyway 이력 표를 쓰는 DB 라면 먼저 V1 체크섬을 맞춘다(`flyway repair`).
- 적용 중에는 그 스키마를 쓰는 앱을 멈춘다(§2-1 과 같은 이유).
- 확인: 표마다 `select column_name from user_tab_columns where table_name = :t order by column_id` 결과가 [`scripts/db-order/column-order.json`](../../scripts/db-order/column-order.json) 순서와 같아야 한다.

## 5. 다시 만들기·검사(개발자)

| 명령 | 용도 |
|---|---|
| `node scripts/db-order/gen.mjs check [--base <ref>]` | 전 V 파일 정적 검사. 새 DB 모양(+ `--base` 의 기존 DB 모양)이 재배치 뒤 규칙 순서인지, 같은 이름 사본 표 순서가 같은지. 어긋나면 exit 1 |
| `node scripts/db-order/gen.mjs rules` | 규칙 데이터 `scripts/db-order/column-order.json` 다시 쓰기(순서 검사 시험이 읽는다) |
| `node scripts/db-order/gen.mjs v1 [--write]` | V1 컬럼 줄 재배열(이번 회차 1회. 머지 뒤에는 V1 을 다시 고치지 않는다) |
| `node scripts/db-order/gen.mjs relocate --base <ref> [--write]` | 재배치 V 파일 생성(이번 회차 1회) |
| `node --test scripts/db-order/tests/` | 생성기 단위 시험 |

엔티티 순서는 Java 소스를 읽어 정한다(Hibernate 를 돌리지 않는다). 앞으로 새 표·새 컬럼은 V 파일을 쓸 때부터 규칙 순서로 쓴다. `ALTER TABLE ADD` 는 끝에 붙으므로, 규칙 순서가 아닌 자리에 컬럼을 더하면 같은 방식의 재배치 V 파일이 필요하다.
