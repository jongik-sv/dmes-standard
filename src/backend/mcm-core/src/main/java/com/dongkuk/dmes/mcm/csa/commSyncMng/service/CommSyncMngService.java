/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commSyncMng OASIS BPMN serviceTask entry point — 단일 action `reg`
 *       (W8 / csa 9 화면 8번째 — 동기화 관리)
 *
 * 분석리포트 §7 (Java UserTask SaveCommSyncMng) + 기능 §10 (API-001 reg) + BPMN §2 (UserTask_runSync) 인용.
 */
package com.dongkuk.dmes.mcm.csa.commSyncMng.service;

import com.dongkuk.dmes.mcm.csa.commSyncMng.dto.CommSyncMngRegRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commSyncMng — OASIS BPMN serviceTask entry point (W8 / csa 9 화면 8번째 — 동기화 관리).
 *
 * <p>Spring bean name {@code commSyncMngService} → BPMN {@code <camunda:class>commSyncMngService</camunda:class>}.
 *
 * <p>BPMN action 1 — As-Is BPMN sequenceFlow name 그대로 보존 (가이드 6 enum 외 신설 사유 §4.1):
 * <ol>
 *   <li>{@code reg} → {@link #reg(CommSyncMngRegRequest, List, List)} — 동기화 실행 (이행).
 *       6 처리유형 분기 (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT).
 *       To-Be 본 화면 책임 = MASTER 3 테이블만 활성 — 나머지 5 처리유형은 후속 도메인 화면 책임 위임
 *       (Q-001 / Q-009 해소 2026-05-31). 본 Service 는 As-Is 분기 구조는 보존하되 MASTER 만 실 동작.</li>
 * </ol>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>To-Be 정책 (분석 §11.0 Q-001~Q-010 해소 2026-05-31):
 * <ul>
 *   <li>Q-001 / Q-009 — 본 화면 책임 = MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL /
 *       TB_MCM_CODE_CATEGORY). 나머지 13 테이블 (RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT 5 그룹)
 *       은 후속 도메인 화면 책임 위임. 본 Service 는 5 enum 분기 진입 시 NotImplementedException 없이
 *       cnt=0 으로 No-op 반환 (As-Is 분기 구조 보존).</li>
 *   <li>Q-002 — Oracle DB Link 3종 폐기 (단일 MSSQL 단일 업무 DB). DB Link 변수는 빈문자열 고정.</li>
 *   <li>Q-003 — VI_MCM_CODE_ACCESS = cma 4 화면 정본 재사용 (MCMAPUSER.VI_MCM_CODE_ACCESS schema 명시).
 *       본 Service 의 selectMasterCodeData 인천 RULE 차단도 동일 schema 명시. 단 본 화면 책임은 MASTER 만
 *       이므로 RULE / RULE_JUDGE 미호출.</li>
 *   <li>Q-005 — LOC 분기 유일화. PRD 분기는 As-Is 코드 보존 (No-op).</li>
 *   <li>Q-006 — BPMN UserTask id = UserTask_runSync (As-Is UserTask_pwdinit 폐기).</li>
 *   <li>Q-007 — package = com.dongkuk.dmes.mcm.csa.commSyncMng.service / dto = ...dto.
 *       Entity = cma 4 화면 재사용 (자체 작성 ✗ — 정책 #6 (A)).</li>
 *   <li>Q-008 — (b) 안 — INSERT INTO ... SELECT * 직후 별도 UPDATE 로
 *       U_USR_ID / U_AT = GETDATE() / U_SVC_ID="commSyncMng" / U_PGM_ID="commSyncMng" 덮어쓰기.
 *       C_USR_ID / C_AT 는 SOURCE 원작자/원작시각 보존.</li>
 *   <li>Q-010 — 화면 존속 (단일 MSSQL 환경에서 schema 간 MCM_SOURCE ↔ MCMAPUSER ↔ MCM_BACKUP 동기화 시나리오).</li>
 * </ul>
 *
 * <p>가이드 §6-A-1 (Entity 본 컬럼만) — 본 화면은 동기화 메타 화면이므로 자체 Entity ✗.
 * cma 4 화면 entity (MasterCode / MasterCodeCategory / MasterCodeDetail) 의 schema 정의 (MCM_SOURCE) 를
 * native SQL 의 FROM 절에서 그대로 사용. INSERT INTO ... SELECT * + audit UPDATE 2 단계 패턴.
 *
 * <p>SQL Injection 대응 (분석 §11.4 / 기능 §11 V-005~V-007):
 *  - {@link #ALLOWED_SCHEMAS} / {@link #ALLOWED_TABLES} / {@link #ALLOWED_TARGETID_REGEX} 화이트리스트 검증.
 *
 * <p>BPMN definition: {@code services/csa/commSyncMng/commSyncMng.bpmn}.
 */
@Service("commSyncMngService")
public class CommSyncMngService {

    private static final Logger log = LoggerFactory.getLogger(CommSyncMngService.class);

    /** 본 화면 책임 = MASTER 3 테이블 (Q-001 해소). */
    private static final String[] MASTER_TABLES = {
            "TB_MCM_CODE_MASTER",
            "TB_MCM_CODE_DETAIL",
            "TB_MCM_CODE_CATEGORY"
    };

    /** 본 화면 책임 schema 화이트리스트 (Q-001 / V-006). */
    private static final Set<String> ALLOWED_SCHEMAS = Set.of(
            "MCM_SOURCE", "MCMAPUSER", "MCM_BACKUP"
    );

    /** 본 화면 책임 테이블 화이트리스트 (V-005). */
    private static final Set<String> ALLOWED_TABLES = Set.of(MASTER_TABLES);

    /** targetid 화이트리스트 — MA1~MA4 만 활성 (Q-001 / V-007). */
    private static final Pattern ALLOWED_TARGETID_REGEX = Pattern.compile("^(MA[1-4])$");

    /** 처리유형 enum 화이트리스트 (V-001). */
    private static final Set<String> ALLOWED_SYNC_TARGETS = Set.of(
            "MASTER", "RULE", "RULE_JUDGE", "INTERFACE", "FORMAT", "OBJECT"
    );

    /** 본 화면 자체 SVC_ID / PGM_ID (audit 덮어쓰기용 — Q-008 b 안). */
    private static final String SVC_ID = "commSyncMng";
    private static final String PGM_ID = "commSyncMng";

    @PersistenceContext
    private EntityManager em;

    /**
     * action {@code reg} 진입점. As-Is BPMN UserTask_pwdinit / SaveCommSyncMng.java 의 6 처리유형 분기.
     *
     * <p>처리 흐름 (분석 §4.5 / §7 / 기능 §5.3):
     * <ol>
     *   <li>입력 검증 — pSyncTarget enum (V-001) / dsObject 비어있지 않음 (V-003)</li>
     *   <li>OBJECT 처리유형 + dsObject "::" 검증 (V-002) — 본 화면 책임 ✗ 라 No-op 단계</li>
     *   <li>처리유형 분기 — MASTER 만 실제 syncMasterCode 호출 / 나머지 5 enum 은 No-op</li>
     *   <li>cnt_save (성공 행 수) 응답</li>
     * </ol>
     *
     * <p>BPMN grids 매핑 (W7 정본 패턴):
     * <ul>
     *   <li>grids.dsMain.rows → method param {@code dsMain} (List&lt;Map&gt;) 자동 매핑</li>
     *   <li>grids.dsObject.rows → method param {@code dsObject} (List&lt;Map&gt;) 자동 매핑</li>
     * </ul>
     *
     * <p>응답: {@code cnt_save} (성공 행 수 — fn_callBack 의 cnt_save==0 분기 / "{N}건 저장 되었습니다." 메시지 정합).
     *
     * @param request   pSyncTarget (6 enum)
     * @param dsMain    이행 매트릭스 (16 정적 행 중 CHK==1 행만 — gfn_transaction ds_main:U 전송)
     * @param dsObject  처리대상 List (edt_Target ',' split 결과)
     * @return {"cnt_save": N}
     */
    public Map<String, Object> reg(CommSyncMngRegRequest request,
                                   List<Map<String, Object>> dsMain,
                                   List<Map<String, Object>> dsObject) {

        // (1) 입력 검증
        String pSyncTarget = request != null ? request.getPSyncTarget() : null;
        if (pSyncTarget == null || pSyncTarget.isBlank()) {
            log.warn("[commSyncMng.reg] pSyncTarget null — V-001 fail");
            return Map.of("cnt_save", 0);
        }
        if (!ALLOWED_SYNC_TARGETS.contains(pSyncTarget)) {
            // V-001 — 화이트리스트 거부
            throw new IllegalArgumentException("V-001 fail — pSyncTarget enum 위반: " + pSyncTarget);
        }
        if (dsObject == null) dsObject = Collections.emptyList();
        if (dsMain == null) dsMain = Collections.emptyList();

        // V-002 — OBJECT 처리유형 "::" 검증 (xfdl:126~129) — 본 화면 책임 ✗ 라 No-op
        if ("OBJECT".equals(pSyncTarget)) {
            for (Map<String, Object> row : dsObject) {
                String obj = strOf(row.get("OBJECT"));
                if (obj == null || !obj.contains("::")) {
                    throw new IllegalArgumentException(
                            "V-002 fail — OBJECT FULLNAME 입력 필요 (예: csa::CommSyncMng): " + obj);
                }
            }
        }

        // (3) 처리유형 분기
        int cnt = 0;
        switch (pSyncTarget) {
            case "MASTER":
                // 본 화면 책임 ✓ (Q-001) — 실제 동기화 수행
                cnt = syncMasterCode(dsMain, dsObject);
                break;
            case "RULE":
            case "RULE_JUDGE":
            case "INTERFACE":
            case "FORMAT":
            case "OBJECT":
                // Q-009 해소 — 후속 도메인 화면 책임 위임 (No-op + 경고 로그)
                log.warn("[commSyncMng.reg] pSyncTarget={} — 본 화면 책임 ✗ (후속 도메인 화면 위임). cnt_save=0",
                        pSyncTarget);
                cnt = 0;
                break;
            default:
                // 위 V-001 검증으로 도달 불가
                throw new IllegalStateException("unreachable — pSyncTarget=" + pSyncTarget);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // syncMasterCode — MASTER 처리유형 (java:94~193 As-Is 인용 + LOC 분기 단일화 — Q-005)
    // ────────────────────────────────────────────────────────────────

    /**
     * As-Is {@code syncMasterCode} (java:94~193) 의 LOC 분기 본문 (java:111~142) 만 To-Be 적용.
     * Q-005 해소 — DB Link 폐기로 LOC 분기 유일화 (PRD 분기는 No-op).
     *
     * <p>처리:
     * <ol>
     *   <li>dsObject 의 각 OBJECT (마스터코드 ID, 예: "USD") 별 loop</li>
     *   <li>dsMain 의 CHK==1 행 (MA1 / MA2) 별 loop — to4 (TARGET schema) ∈ {MCMAPUSER, MCM_BACKUP}</li>
     *   <li>MASTER 3 테이블 (TB_MCM_CODE_MASTER / TB_MCM_CODE_DETAIL / TB_MCM_CODE_CATEGORY) 별 loop</li>
     *   <li>backup schema 의 DETAIL 제외 (As-Is java:115 {@code if(j==0 || (j==1 && k!=1))})</li>
     *   <li>DELETE FROM target.table WHERE MASTER_CODE = :object → INSERT INTO target.table SELECT * FROM
     *       MCM_SOURCE.table WHERE MASTER_CODE = :object → UPDATE target.table SET U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID
     *       WHERE MASTER_CODE = :object (Q-008 b 안 audit 덮어쓰기)</li>
     *   <li>SOURCE (MCM_SOURCE) 의 CODE_VER 도 NVL(MAX(CODE_VER)+0.1, 1) → ISNULL 변환 (MSSQL) 으로 UP</li>
     * </ol>
     *
     * @return 성공 행 수 (DELETE + INSERT rowcount 합)
     */
    private int syncMasterCode(List<Map<String, Object>> dsMain, List<Map<String, Object>> dsObject) {
        int cnt = 0;

        // CHK==1 행만 추출 + targetid 화이트리스트 검증 (V-007 — MA1~MA4 만 활성)
        List<Map<String, Object>> targetRows = filterCheckedRows(dsMain);
        if (targetRows.isEmpty()) {
            log.warn("[commSyncMng.syncMasterCode] dsMain CHK==1 행 0 — cnt_save=0 (fn_callBack warning 정합)");
            return 0;
        }

        for (Map<String, Object> objRow : dsObject) {
            String object = strOf(objRow.get("OBJECT"));
            if (object == null || object.isBlank()) {
                // As-Is java:97 `if("".equals(Object)) continue;` 보존
                continue;
            }

            // (1) SOURCE CODE_VER UP (MCM_SOURCE.TB_MCM_CODE_MASTER + DETAIL) — getCodeVer (MSSQL ISNULL)
            String nextVer = selectNextCodeVer(object);
            updateSourceCodeVer("TB_MCM_CODE_MASTER", object, nextVer);
            updateSourceCodeVer("TB_MCM_CODE_DETAIL", object, nextVer);

            // (2) TARGET 동기화 — dsMain 의 CHK==1 행 × MASTER 3 테이블
            for (Map<String, Object> row : targetRows) {
                String to4 = strOf(row.get("to4"));   // TARGET schema (MCMAPUSER / MCM_BACKUP)
                String from4 = strOf(row.get("from4")); // SOURCE schema (MCM_SOURCE)
                if (!ALLOWED_SCHEMAS.contains(to4)) {
                    throw new IllegalArgumentException("V-006 fail — to4 schema 위반: " + to4);
                }
                if (!ALLOWED_SCHEMAS.contains(from4)) {
                    throw new IllegalArgumentException("V-006 fail — from4 schema 위반: " + from4);
                }

                for (int k = 0; k < MASTER_TABLES.length; k++) {
                    String table = MASTER_TABLES[k];
                    // As-Is java:115 — backup schema (MCM_BACKUP) 의 DETAIL (k==1) 제외
                    if ("MCM_BACKUP".equals(to4) && k == 1) {
                        continue;
                    }

                    cnt += syncOneTable(from4, to4, table, "MASTER_CODE", object);
                }
            }
        }
        return cnt;
    }

    // ────────────────────────────────────────────────────────────────
    // 동기화 본체 — DELETE → INSERT → audit UPDATE (3 단계)
    // ────────────────────────────────────────────────────────────────

    /**
     * 단일 테이블 SOURCE → TARGET 동기화. As-Is Mapper.xml deleteSourceData + insertSourceData + To-Be 신규
     * updateSyncAudit (Q-008 b 안) 3 SQL 호출.
     *
     * @param fromSchema  SOURCE schema (예: MCM_SOURCE) — 화이트리스트 검증 완료
     * @param toSchema    TARGET schema (예: MCMAPUSER) — 화이트리스트 검증 완료
     * @param table       MASTER 테이블 (예: TB_MCM_CODE_MASTER) — 화이트리스트 검증
     * @param whereColumn 매칭 컬럼명 (MASTER_CODE 고정 — 화이트리스트 검증)
     * @param whereValue  매칭 값 (예: "USD") — bind parameter (#{})
     * @return DELETE rowcount + INSERT rowcount 합
     */
    private int syncOneTable(String fromSchema, String toSchema, String table,
                             String whereColumn, String whereValue) {
        if (!ALLOWED_TABLES.contains(table)) {
            throw new IllegalArgumentException("V-005 fail — table 위반: " + table);
        }
        if (!"MASTER_CODE".equals(whereColumn)) {
            // V-011 — whereColumn 화이트리스트 (MASTER 화면은 MASTER_CODE 만 사용)
            throw new IllegalArgumentException("V-011 fail — whereColumn 위반: " + whereColumn);
        }

        // (1) DELETE FROM target.table WHERE MASTER_CODE = :v
        int deleted = em.createNativeQuery(
                "DELETE FROM " + toSchema + "." + table + " WHERE " + whereColumn + " = :v")
                .setParameter("v", whereValue)
                .executeUpdate();

        // (2) INSERT INTO target.table SELECT * FROM source.table WHERE MASTER_CODE = :v
        int inserted = em.createNativeQuery(
                "INSERT INTO " + toSchema + "." + table +
                " SELECT * FROM " + fromSchema + "." + table +
                " WHERE " + whereColumn + " = :v")
                .setParameter("v", whereValue)
                .executeUpdate();

        // (3) audit UPDATE — Q-008 (b) 안: U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID 덮어쓰기
        //     C_USR_ID / C_AT 는 SOURCE 원작자/원작시각 보존 (덮어쓰기 ✗).
        em.createNativeQuery(
                "UPDATE " + toSchema + "." + table +
                " SET U_USR_ID = :userId, U_AT = GETDATE(), " +
                "     U_SVC_ID = :svcId, U_PGM_ID = :pgmId " +
                " WHERE " + whereColumn + " = :v")
                .setParameter("userId", currentUserId())
                .setParameter("svcId", SVC_ID)
                .setParameter("pgmId", PGM_ID)
                .setParameter("v", whereValue)
                .executeUpdate();

        log.info("[commSyncMng.syncOneTable] {}.{} ← {}.{} WHERE {}={} → deleted={} inserted={}",
                toSchema, table, fromSchema, table, whereColumn, whereValue, deleted, inserted);

        return deleted + inserted;
    }

    /**
     * As-Is {@code getCodeVer} (xml:13~17) — Oracle {@code NVL(MAX(CODE_VER)+0.1, 1)} →
     * MSSQL {@code ISNULL(MAX(CAST(CODE_VER AS DECIMAL(10,1)))+0.1, 1)} (Q-002 변환).
     *
     * <p>CODE_VER 는 entity 상 VARCHAR(50) 이나 As-Is Oracle 에서는 NUMBER 산술이 동작. To-Be MSSQL 은
     * CAST 명시 후 산술 결과를 NVARCHAR 로 다시 반환.
     */
    private String selectNextCodeVer(String masterCode) {
        Query q = em.createNativeQuery(
                "SELECT CAST(ISNULL(MAX(CAST(CODE_VER AS DECIMAL(10,1))) + 0.1, 1) AS NVARCHAR(50)) " +
                "  FROM MCM_SOURCE.TB_MCM_CODE_MASTER " +
                " WHERE MASTER_CODE = :masterCode");
        q.setParameter("masterCode", masterCode);
        Object v = q.getSingleResult();
        return v == null ? "1" : v.toString();
    }

    /**
     * SOURCE schema (MCM_SOURCE) 의 CODE_VER UP — As-Is java:106~107 (TB_MCM_CODE_MASTER_Mapper.update +
     * TB_MCM_CODE_DETAIL_Mapper.update). To-Be cactus 표준 Mapper 폐기 + 본 Service 직접 UPDATE.
     */
    private void updateSourceCodeVer(String table, String masterCode, String codeVer) {
        if (!ALLOWED_TABLES.contains(table)) {
            throw new IllegalArgumentException("V-005 fail — table 위반: " + table);
        }
        em.createNativeQuery(
                "UPDATE MCM_SOURCE." + table + " SET CODE_VER = :ver WHERE MASTER_CODE = :masterCode")
                .setParameter("ver", codeVer)
                .setParameter("masterCode", masterCode)
                .executeUpdate();
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    /** dsMain 의 CHK==1 행만 추출 + targetid 화이트리스트 검증 (V-007). */
    private List<Map<String, Object>> filterCheckedRows(List<Map<String, Object>> dsMain) {
        java.util.ArrayList<Map<String, Object>> out = new java.util.ArrayList<>(dsMain.size());
        for (Map<String, Object> row : dsMain) {
            if (row == null) continue;
            Object chk = row.get("CHK");
            String chkStr = chk == null ? "" : String.valueOf(chk);
            if (!"1".equals(chkStr) && !"true".equalsIgnoreCase(chkStr)) {
                continue;
            }
            String targetid = strOf(row.get("targetid"));
            if (targetid == null || !ALLOWED_TARGETID_REGEX.matcher(targetid).matches()) {
                // V-007 — MA1~MA4 만 활성 (MASTER 본 화면 책임)
                log.warn("[commSyncMng.filterCheckedRows] targetid 화이트리스트 위반 — skip: {}", targetid);
                continue;
            }
            out.add(new HashMap<>(row));
        }
        return out;
    }

    /**
     * 현재 사용자 ID — 가이드 §6-B audit 정합. SecurityContext / SessionContext 미지원 시 "system" fallback.
     *
     * <p>본 화면 단일 사이클에서는 Spring SecurityContext 접근 패턴이 csa W1~W7 와 동일 — 후속 통합 cycle 에서
     * audit listener 와 통합 가능. 본 cycle 은 "system" fallback.
     */
    private String currentUserId() {
        // TODO: SecurityContext 통합 (csa 9 화면 후속 cycle) — 본 cycle 은 system fallback
        return "system";
    }

}
