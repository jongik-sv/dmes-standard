package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 품질사양 표를 SQL 로 읽는다(V2 품질사양 담당 표, 읽기 전용). 표가 없거나 읽지 못하면 단계를 건너뛰게 available=false. */
@Component
public class JdbcSpecSource implements SpecSource {

    private static final String SPEC_SQL = """
            SELECT S.SPEC_NO
                 , S.STATUS
                 , T.SIDE
                 , T.SEQ
                 , T.ATTR_CD
                 , T.ATTR_NM
                 , T.OP
                 , T.VAL
                 , T.UNIT
              FROM TB_MQC_QSPEC S
                 , TB_MQC_QSPEC_TERM T
             WHERE T.SPEC_NO = S.SPEC_NO
               AND S.CUS_CD = ?
               AND S.PRD_NM_CD = ?
             ORDER BY S.SPEC_NO, T.SIDE, T.SEQ""";
    private static final String BASE_SQL = """
            SELECT ATTR_CD
                 , BASE_VAL
              FROM TB_MQC_QSPEC_BASE
             ORDER BY SEQ""";
    private static final String ATTR_SQL = """
            SELECT ATTR_CD
                 , ATTR_NM
              FROM TB_MQC_QSPEC_ATTR
             ORDER BY SEQ""";

    private final JdbcTemplate jdbc;

    public JdbcSpecSource(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public SpecData load(String cusCd, String prdNmCd) {
        try {
            Map<String, String> names = new LinkedHashMap<>();
            jdbc.query(ATTR_SQL, rs -> { names.put(rs.getString(1), rs.getString(2)); });
            Map<String, String> base = new LinkedHashMap<>();
            jdbc.query(BASE_SQL, rs -> { base.put(rs.getString(1), rs.getString(2)); });
            Map<String, String> status = new LinkedHashMap<>();
            Map<String, List<Term>> terms = new LinkedHashMap<>();
            jdbc.query(SPEC_SQL, rs -> {
                String no = rs.getString(1);
                status.put(no, rs.getString(2));
                terms.computeIfAbsent(no, k -> new ArrayList<>()).add(new Term(rs.getString(3), rs.getInt(4), rs.getString(5),
                        rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9)));
            }, cusCd, prdNmCd);
            List<Spec> specs = new ArrayList<>();
            terms.forEach((no, t) -> specs.add(new Spec(no, status.get(no), t)));
            return new SpecData(true, null, specs, base, names);
        } catch (DataAccessException e) {
            return SpecData.unavailable("품질사양 표를 읽지 못해 이 단계를 건너뜁니다");
        }
    }
}
