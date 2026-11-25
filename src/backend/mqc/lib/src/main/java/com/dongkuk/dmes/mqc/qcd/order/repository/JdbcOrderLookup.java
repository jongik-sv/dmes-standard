package com.dongkuk.dmes.mqc.qcd.order.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** TB_MQC_ORD 를 SQL 로 읽는다(칼럼이 40개가 넘는 읽기 전용 주문이라 엔티티 대신 칼럼 이름 → 값으로 편다). */
@Repository
public class JdbcOrderLookup implements OrderLookup {

    private static final String COLS = """
            SELECT ORD_REQ_NO, ORD_REQ_LN, PRD_NM_CD, PRD_SHP, SPC_AVR, MAT_CD, ORD_EXC_THK, ORD_EXC_WTH
                 , FNL_CUS_CD, FNL_CUS_NM, ORD_USG_CD, ORD_USG_NM, ORD_USG_DTL, ORD_EDG_ASG_TP, ORD_LN_WGT, ORD_SLIT_GRP_CNT
                 , ORD_PAK_UNT_WGT_ULV, ORD_PAK_UNT_WGT_LLV, ORD_PTT_FLM_CD, ORD_SLV_KND_TP, FLOW_CHL, NAT_CD, ORD_KND
                 , CUS_CD, ACT_CUS_CD, SPC_YR, ORD_SZ, ORD_THK_TP, WGT_DCS_MTH_TP, ORD_WGT_UNT, ORD_PAK_MTH, ORD_THK_MNG_CD
                 , ORD_WTH_MNG_CD, ORD_RGS_PRS_ID, ORD_TEM_CD, ORD_COIL_IDIA, ORD_COILG_MTH, GW_ASG_CD, CCL_BOM_NO
                 , ORD_SPNL_TP, URGENT_YN, REQ_DT, SRC_TP, EXTRA_JSON
              FROM TB_MQC_ORD
            """;
    private static final Map<String, Integer> SCALE = Map.of("ORD_EXC_THK", 3, "ORD_EXC_WTH", 1, "ORD_LN_WGT", 1);

    private final JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    public JdbcOrderLookup(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public List<Map<String, String>> all() {
        return jdbc.query(COLS + " ORDER BY REQ_DT DESC, ORD_REQ_NO, ORD_REQ_LN", (rs, i) -> toMap(rs));
    }

    @Override
    public Optional<Map<String, String>> one(String ordReqNo, String ordReqLn) {
        List<Map<String, String>> rows = jdbc.query(COLS + " WHERE ORD_REQ_NO = ? AND ORD_REQ_LN = ?", (rs, i) -> toMap(rs), ordReqNo, ordReqLn);
        return rows.stream().findFirst();
    }

    private Map<String, String> toMap(ResultSet rs) throws SQLException {
        Map<String, String> m = new LinkedHashMap<>();
        ResultSetMetaData md = rs.getMetaData();
        String extra = null;
        for (int c = 1; c <= md.getColumnCount(); c++) {
            String name = md.getColumnLabel(c).toUpperCase();
            if ("EXTRA_JSON".equals(name)) {
                extra = rs.getString(c);
                continue;
            }
            Object v = rs.getObject(c);
            if (v instanceof BigDecimal b) {
                Integer scale = SCALE.get(name);
                m.put(name, scale == null ? b.stripTrailingZeros().toPlainString() : b.setScale(scale, RoundingMode.HALF_UP).toPlainString());
            } else {
                m.put(name, v == null ? null : String.valueOf(v));
            }
        }
        if (extra != null && !extra.isBlank()) {
            try {
                Map<String, Object> e = json.readValue(extra, new TypeReference<LinkedHashMap<String, Object>>() {});
                e.forEach((k, v) -> m.putIfAbsent(k, v == null ? null : String.valueOf(v)));
            } catch (Exception ignored) {
                // 깨진 추가 항목은 무시한다(주문 본 칼럼은 그대로 쓴다).
            }
        }
        return m;
    }
}
