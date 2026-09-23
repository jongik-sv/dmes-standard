package kr.dongkuk.maru.mdm.engine.testsupport;

import java.util.Arrays;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CodeRef;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DomainKind;

/**
 * 02 「도메인 종류」·상속 예시의 고정 데이터(TSK-03-02 design.md §3.3·§3.4). 도메인마다 02 의 <b>자신의 식</b>만 적고,
 * 유효 식은 {@link EffectiveExpressions#text} 로 조상부터 AND 로 잇는다(02 "파생값을 저장하지 않는다").
 * 컬럼 이름은 도메인 표준명과 같게 둔다.
 */
public final class DomainFixtures {

    public static final String TABLE = "TB_DOMAIN_CASE";

    /** 02:1001-1007 일자 도메인(30) 정규식을 한 줄로 이은 것(219자). CSV 구분자와 섞이지 않게 상수로 둔다. */
    public static final String DATE_REGEX = "^(?:(?:19|20)[0-9]{2}(?:(?:0[13578]|1[02])(?:0[1-9]|[12][0-9]|3[01])"
            + "|(?:0[469]|11)(?:0[1-9]|[12][0-9]|30)|02(?:0[1-9]|1[0-9]|2[0-8]))"
            + "|(?:19(?:0[48]|[2468][048]|[13579][26])|20(?:[02468][048]|[13579][26]))0229|99991231)$";

    /** 코일 두께(10) — 02:55·994. */
    public static final String COIL_THK_OWN = "value >= 0.1 && value <= 3.5 && value % 0.1 == 0";
    /** 원재료 코일 두께(11) — 10 상속(02:995). */
    public static final String RMTL_COIL_THK_OWN = "value >= 1.6";
    /** 중량 트리(02:91-101). */
    public static final String WGT_OWN = "value > 0";
    public static final String COIL_WGT_OWN = "value <= 30";
    public static final String COIL_PAK_WGT_OWN = "value >= 1 && value <= 25";
    public static final String COIL_GRS_WGT_BIZ = "value >= COIL_NET_WGT";
    /** 코일 식별자(20) — 02:57·996. */
    public static final String COIL_ID_OWN = "STR_MATCHES(value, \"^[A-Z0-9]{10,20}$\")";
    /** 고객명 — 02:58. */
    public static final String CUST_NM_OWN = "STR_TRIM(value) != \"\"";
    /** 일자(30) — 02:997·1001. */
    public static final String DT_OWN = "STR_MATCHES(value, \"" + DATE_REGEX + "\")";
    /** 출하일자 — 일자(30) 상속, 비즈니스식(02:59·1053). */
    public static final String SHIP_DT_BIZ = "value >= PROD_START_DT";
    /** FLAG — 02:60. */
    public static final String USE_YN_OWN = "value == \"Y\" || value == \"N\"";
    public static final String GRADE_FLAG_OWN =
            "value == \"1\" || value == \"2\" || value == \"3\" || value == \"4\" || value == \"D\"";

    private DomainFixtures() {}

    /** 02 도메인 컬럼 12개 + CODE 종류가 참조하는 PROC_CD 마루 코드. */
    public static InMemoryLookups lookups() {
        return InMemoryLookups.create()
                .code(CodeFixtures.procCd())
                .column(number("COIL_THK", 1, List.of(COIL_THK_OWN), null))
                .column(number("RMTL_COIL_THK", 1, List.of(COIL_THK_OWN, RMTL_COIL_THK_OWN), null))
                .column(number("COIL_WGT", 3, List.of(WGT_OWN, COIL_WGT_OWN), null))
                .column(number("COIL_PAK_WGT", 3, List.of(WGT_OWN, COIL_WGT_OWN, COIL_PAK_WGT_OWN), null))
                .column(number("COIL_GRS_WGT", 3, Arrays.asList(WGT_OWN, COIL_WGT_OWN, null), List.of(COIL_GRS_WGT_BIZ)))
                .column(new ColumnDefinition(TABLE, "PROC_CD", DomainKind.CODE, DataType.STRING, null, false,
                        null, null, List.of(), new CodeRef(CodeFixtures.PROC_CD, "COATING"),
                        "CODE", CodeFixtures.PROC_CD, "COATING"))
                .column(string("COIL_ID", DomainKind.ID, List.of(COIL_ID_OWN), null))
                .column(string("CUST_NM", DomainKind.TEXT, List.of(CUST_NM_OWN), null))
                .column(string("DT", DomainKind.DATE, List.of(DT_OWN), null))
                .column(string("SHIP_DT", DomainKind.DATE, Arrays.asList(DT_OWN, null), List.of(SHIP_DT_BIZ)))
                .column(string("USE_YN", DomainKind.FLAG, List.of(USE_YN_OWN), null))
                .column(string("GRADE_FLAG", DomainKind.FLAG, List.of(GRADE_FLAG_OWN), null));
    }

    private static ColumnDefinition number(String name, int scale, List<String> stdChain, List<String> bizChain) {
        return column(name, DomainKind.QTY, DataType.NUMBER, scale, stdChain, bizChain);
    }

    private static ColumnDefinition string(String name, DomainKind kind, List<String> stdChain, List<String> bizChain) {
        return column(name, kind, DataType.STRING, null, stdChain, bizChain);
    }

    /** 요구 변수는 정의에 싣지 않는다 — 검증기가 유효 비즈니스식에서 계산하는 경로를 쓴다. */
    private static ColumnDefinition column(String name, DomainKind kind, DataType type, Integer scale,
                                           List<String> stdChain, List<String> bizChain) {
        return new ColumnDefinition(TABLE, name, kind, type, scale, false,
                EffectiveExpressions.text(stdChain), bizChain == null ? null : EffectiveExpressions.text(bizChain),
                List.of(), null, null, null, null);
    }
}
