package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * ERD 모델 목록·스키마 후보(ERD 2차 §7.2)와 모델의 모듈·스키마(DB 비교·가져오기) 읽기. {@link ErdEditService} 가 쓴다. JdbcTemplate 으로 읽으므로 OASIS
 * 바깥 트랜잭션에 합류한다 — 스스로 트랜잭션을 열지 않는다.
 */
@Component
public class ErdModelQuery {

    private final JdbcTemplate jdbc;

    public ErdModelQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 모델 목록, 모델 id 순. 모델마다 DRAFT 가 있으면 그 번호와 소유자, 모델 상태, 최신 확정본(RELEASED 중 가장 큰 번호, 없으면 null),
     * 만든 사람(C_USR_ID)을 붙인다. 상태는 {@link RuleVersions#effectiveStatus} 로 released(모델 → RELEASED 행)·now 에서 계산한다.
     */
    List<Map<String, Object>> list(Map<String, List<ErdModelStore.ReleasedRow>> released, LocalDateTime now) {
        return jdbc.query("""
                SELECT M.ERD_MODEL_ID
                     , M.MODULE_ID
                     , M.SCHEMA_NAME
                     , M.MODEL_NAME
                     , M.REV
                     , M.STATUS AS MODEL_STATUS
                     , M.C_USR_ID
                     , (SELECT MAX(R.VER)
                          FROM TB_MDM_ERD_MODEL_VER R
                         WHERE R.ERD_MODEL_ID = M.ERD_MODEL_ID
                           AND R.STATUS = 'RELEASED') AS RELEASED_VER
                     , D.VER
                     , D.OWNER_ID
                  FROM TB_MDM_ERD_MODEL M
                     , TB_MDM_ERD_MODEL_VER D
                 WHERE D.ERD_MODEL_ID(+) = M.ERD_MODEL_ID
                   AND D.STATUS(+) = 'DRAFT'
                 ORDER BY M.ERD_MODEL_ID
                """, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("modelId", rs.getString("ERD_MODEL_ID"));
            row.put("moduleId", rs.getString("MODULE_ID"));
            row.put("schemaName", rs.getString("SCHEMA_NAME"));
            row.put("modelName", rs.getString("MODEL_NAME"));
            row.put("rev", rs.getLong("REV"));
            BigDecimal draftVer = rs.getBigDecimal("VER");
            row.put("draftVer", draftVer == null ? null : VersionNumbers.plain(draftVer));
            row.put("ownerId", rs.getString("OWNER_ID"));
            row.put("status", RuleVersions.effectiveStatus(rs.getString("MODEL_STATUS"),
                    released.getOrDefault(rs.getString("ERD_MODEL_ID"), List.of()), now));
            BigDecimal releasedVer = rs.getBigDecimal("RELEASED_VER");
            row.put("releasedVer", releasedVer == null ? null : VersionNumbers.plain(releasedVer));
            row.put("createdBy", rs.getString("C_USR_ID"));
            return row;
        });
    }

    /**
     * 스키마 후보 — {@code ALL_USERS} 중 Oracle 이 관리하지 않는 사용자({@code ORACLE_MAINTAINED='N'}) 이름, 이름 순.
     * 행 = {@code {schemaName}}. 비거나 실패하면 화면은 직접 입력을 받는다.
     */
    List<Map<String, Object>> schemas() {
        return jdbc.query("""
                SELECT USERNAME
                  FROM ALL_USERS
                 WHERE ORACLE_MAINTAINED = 'N'
                 ORDER BY USERNAME
                """, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("schemaName", rs.getString("USERNAME"));
            return row;
        });
    }

    /** 모델 행의 [MODULE_ID, SCHEMA_NAME]. 없으면 ERD_MODEL_NOT_FOUND, 스키마 이름이 비었으면 입력 오류. */
    String[] moduleAndSchema(String modelId) {
        List<String[]> rows = jdbc.query("SELECT MODULE_ID, SCHEMA_NAME FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}, modelId);
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        if (rows.get(0)[1] == null || rows.get(0)[1].isBlank()) throw MdmErrors.invalid("모델에 스키마 이름이 없습니다: " + modelId);
        return rows.get(0);
    }
}
