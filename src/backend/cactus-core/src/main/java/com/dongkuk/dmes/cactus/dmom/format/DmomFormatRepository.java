package com.dongkuk.dmes.cactus.dmom.format;

import org.mybatis.spring.SqlSessionTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * FORMAT 조회 리포지토리. TC → 활성 FORMAT_LAYOUT, 및 SEND_TABLE_ID 조회.
 *
 * <p>업무 tx DataSource 에 바인딩된 {@code bizTemplate}(기본 {@code sqlSessionTemplateBiz}) 사용.
 * MOM 설정 테이블은 MCMAPUSER 스키마(매퍼 SQL 에서 schema-qualified).
 *
 * <p>★ {@code cactus-mybatis-config.xml} 의 {@code mapUnderscoreToCamelCase=true} 로 인해
 * {@code resultType=map} 결과 키는 camelCase({@code formatId/itemSeq/itemTp/...}) 로 온다.
 */
public class DmomFormatRepository {

    private final SqlSessionTemplate bizTemplate;
    private final String defaultSendTablePrefix;

    public DmomFormatRepository(SqlSessionTemplate bizTemplate, String defaultSendTablePrefix) {
        this.bizTemplate = bizTemplate;
        this.defaultSendTablePrefix = defaultSendTablePrefix;
    }

    /**
     * TC 의 활성 FORMAT_LAYOUT 조회 (최신 활성 FORMAT_VER).
     *
     * @param transactionCode 포맷 조회용 TC (transferTc 우선)
     * @param interfaceId     인터페이스 ID (현재 SQL 에서는 미사용, 향후 확장 여지)
     * @return FormatLayout (없으면 {@link FormatLayout#empty()})
     */
    public FormatLayout getActiveLayout(String transactionCode, String interfaceId) {
        Map<String, Object> param = new HashMap<>();
        param.put("transactionCode", transactionCode);
        param.put("interfaceId", interfaceId);

        List<Map<String, Object>> rows = bizTemplate.selectList("DmomMapper.getFormatLayout", param);
        if (rows == null || rows.isEmpty()) {
            return FormatLayout.empty();
        }

        List<FormatItem> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            items.add(new FormatItem(
                    toLong(row.get("itemSeq")),
                    str(row.get("itemTp")),
                    str(row.get("itemId")),
                    str(row.get("itemNm")),
                    str(row.get("dataTp")),
                    toInt(row.get("dataLen")),
                    toInt(row.get("dataDecimalPrec"))
            ));
        }
        Map<String, Object> first = rows.get(0);
        return new FormatLayout(str(first.get("formatId")), toBigDecimal(first.get("formatVer")), items);
    }

    /**
     * 송신 대상 IF 테이블명 조회. {@code TB_MCM_MOM_INTERFACES.SEND_TABLE_ID}, 미지정 시
     * {@code <prefix><INTERFACE_ID>} (기본 {@code IF_<INTERFACE_ID>}).
     */
    public String resolveSendTable(String interfaceId, String transactionCode) {
        Map<String, Object> param = new HashMap<>();
        param.put("interfaceId", interfaceId);
        param.put("transactionCode", transactionCode);

        String table = bizTemplate.selectOne("DmomMapper.getSendTableId", param);
        return (table != null && !table.isBlank()) ? table : defaultSendTablePrefix + interfaceId;
    }

    // ── helpers ──

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static long toLong(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString().trim());
    }

    private static int toInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.intValue();
        return Integer.parseInt(o.toString().trim());
    }

    private static BigDecimal toBigDecimal(Object o) {
        if (o == null) return null;
        if (o instanceof BigDecimal b) return b;
        if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return new BigDecimal(o.toString().trim());
    }
}
