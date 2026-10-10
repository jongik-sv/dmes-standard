package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdImportBuilder;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping.PhysType;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** S2-3 실측: physicalOf 로 DDL 을 만들고 다시 가져오면 같은 물리 타입이 나온다(DB_DIFF 0 의 근거). MDMAPUSER 에 시험 표 하나만 만든다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class ErdTypeMappingOracleTest extends AbstractMdmSharedDbTest {

    static final String TABLE = "TB_ERD_TYPE_MAP";

    static final List<ErdDomainSpec> DOMAINS = List.of(
            new ErdDomainSpec(1L, "명", "STRING", 100, null),
            new ErdDomainSpec(2L, "긴글", "STRING", null, null),
            new ErdDomainSpec(3L, "금액", "NUMBER", 15, 2),
            new ErdDomainSpec(4L, "순번", "NUMBER", 19, null),
            new ErdDomainSpec(5L, "수", "NUMBER", null, null),
            new ErdDomainSpec(6L, "비율", "NUMBER", null, 4),
            new ErdDomainSpec(7L, "일자", "DATE", null, null),
            new ErdDomainSpec(8L, "일시", "DATE", null, 6),
            new ErdDomainSpec(9L, "여부", "BOOLEAN", null, null));

    @Autowired ErdDbMetaReader reader;
    @Autowired JdbcTemplate jdbc;

    /** P3 의 DDL 생성기가 쓸 글자와 같다: 문자 길이는 CHAR 의미, NUMBER 는 정밀도가 있으면 (p,s). */
    static String ddl(PhysType p) {
        if ("VARCHAR2".equals(p.dataType())) return "VARCHAR2(" + p.length() + " CHAR)";
        if ("NUMBER".equals(p.dataType())) return p.length() == null ? "NUMBER" : "NUMBER(" + p.length() + "," + p.scale() + ")";
        return p.dataType();   // DATE · CLOB · TIMESTAMP(n)
    }

    @Test
    void physicalTypesSurviveOracleDdlRoundTrip() {
        drop();
        try {
            List<String> cols = new ArrayList<>();
            for (int i = 0; i < DOMAINS.size(); i++) cols.add("C" + i + " " + ddl(ErdTypeMapping.physicalOf(DOMAINS.get(i))));
            jdbc.execute("CREATE TABLE " + TABLE + " (" + String.join(", ", cols) + ")");
            ErdDbMeta.Table t = reader.read("MDMAPUSER").tables().stream()
                    .filter(x -> x.name().equals(TABLE)).findFirst().orElseThrow();
            for (int i = 0; i < DOMAINS.size(); i++) {
                String name = "C" + i;
                ErdDbMeta.Column c = t.columns().stream().filter(x -> x.name().equals(name)).findFirst().orElseThrow();
                ErdImportBuilder.ColumnType back = ErdImportBuilder.typeOf(c);
                assertThat(new PhysType(back.dataType(), back.length(), back.scale()))
                        .as(DOMAINS.get(i) + " → " + c).isEqualTo(ErdTypeMapping.physicalOf(DOMAINS.get(i)));
            }
        } finally {
            drop();
        }
    }

    void drop() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = ?", Integer.class, TABLE);
        if (n != null && n > 0) jdbc.execute("DROP TABLE " + TABLE + " PURGE");
    }
}
