package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnInfo;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDictionary;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * D-151 결정 5 — V22 이행 채움 전후로 RELEASED 합성이 같다. V22 는 고정 표시 'N'·NULL 칸만 더하고, 고정 표시가 없는 행의 합성은 이전
 * 코드와 같은 경로(지금 사전)를 탄다. 그래서 확정 경로를 거치지 않은 RELEASED(시험 준비 {@code release} — 고정 표시 없음)가 "V22 직전
 * 상태" 다. 그 위에서 V22 파일의 채움 블록만 잘라 다시 돌리고 합성(시각 T·피드 구간·헤더 한 벌)을 비교한다. 채운 값은 항목마다 합성기가
 * 쓰는 {@link LayoutDictionary#byPhysNames} 값과 같아야 하고(도메인 상속 사슬·도메인 없는 컬럼 포함), 확정 이후 버전의 항목은 하나도
 * 빠짐없이 고정 표시돼야 한다. 채운 뒤에는 사전을 바꿔도 — 값이 없던 칸에 값이 생겨도 — RELEASED 합성이 그대로이고, DRAFT 는 새 값을 쓴다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutPinMigrationEquivalenceSqliteTest extends LayoutServiceTestSupport {

    private static final String V22 = "db/migration/mdm/sqlite/V22__layout_item_pin_column_attrs.sql";
    private static final List<LocalDateTime> TIMES = List.of(LocalDateTime.of(2026, 2, 1, 0, 0), LocalDateTime.of(2026, 6, 30, 12, 0));

    @Autowired LayoutComposer composer;
    @Autowired LayoutReleaseTimeline timeline;
    @Autowired LayoutDictionary dictionary;

    @Test
    void v22FillKeepsReleasedCompositionAndPinsTheDictionaryValues() {
        M201 m = m201();
        // 도메인 상속 사슬 — COIL_THK 는 자식 도메인(자기 STRING·소수·단위 없음)으로, 유효값은 부모의 NUMBER·소수 1·단위 mm
        unit("mm", "LENGTH", "mm", "1");
        unit("kg", "WEIGHT", "kg", "1");
        long parent = domainWithUnit("PIN_PARENT", "NUMBER", 3, 1, "mm");
        long child = domain("PIN_CHILD", "QTY", "STRING", 3, null, parent);
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'COIL_THK'", child);
        // 도메인 없는 컬럼(V16) — 유효값 셋 다 없음
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = NULL WHERE PHYS_NAME = 'PROD_DT'");
        // 전문 새 DRAFT — 채우지 않는다
        newDraft(m.message(), "1.000", "2.000");

        Map<String, Object> before = compositions(m);
        assertThat(pins(m.message(), "1.000")).allMatch(p -> p.endsWith("=N:-|-|-")); // V22 직전 — 고정 표시·고정값 없음

        runFill();

        assertThat(compositions(m)).isEqualTo(before);
        // 이행 누락 없음 — 확정 이후 버전(DRAFT·LEGACY 아님)의 항목은 전부 고정 표시됐다
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_ITEM i JOIN TB_MDM_LAYOUT_VER v "
                + "ON v.LAYOUT_ID = i.LAYOUT_ID AND v.VER = i.VER WHERE v.STATUS <> 'DRAFT' AND v.LEGACY_SNAPSHOT_YN = 'N' "
                + "AND i.PINNED_YN <> 'Y'", Integer.class)).isZero();
        // 채운 값 = 합성기가 쓰는 사전 값(항목마다)
        for (long id : List.of(m.l100(), m.l110(), m.message())) {
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT COLUMN_PHYS, DATA_TYPE, UNIT_CODE, SCALE FROM TB_MDM_LAYOUT_ITEM "
                    + "WHERE LAYOUT_ID = ? AND VER = 1 AND COLUMN_PHYS IS NOT NULL", id);
            assertThat(rows).isNotEmpty();
            Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(rows.stream().map(r -> (String) r.get("COLUMN_PHYS")).toList());
            for (Map<String, Object> r : rows) {
                LayoutColumnInfo col = dict.get((String) r.get("COLUMN_PHYS"));
                assertThat(r.get("DATA_TYPE")).as("%s 타입", r.get("COLUMN_PHYS")).isEqualTo(col.dataType());
                assertThat(r.get("UNIT_CODE")).as("%s 단위", r.get("COLUMN_PHYS")).isEqualTo(col.unitCode());
                assertThat(r.get("SCALE") == null ? null : ((Number) r.get("SCALE")).intValue()).as("%s 소수", r.get("COLUMN_PHYS"))
                        .isEqualTo(col.scale());
            }
        }
        assertThat(pins(m.message(), "1.000")).containsExactly("1:COIL_ID=Y:STRING|-|-", "2:PROD_DT=Y:-|-|-",
                "3:COIL_THK=Y:NUMBER|mm|1", "4:-=Y:-|-|-");
        assertThat(pins(m.message(), "2.000")).allMatch(p -> p.endsWith("=N:-|-|-")); // DRAFT 는 고정하지 않는다

        // 채운 뒤 사전을 바꾼다 — 부모 도메인 타입·소수·단위, 헤더 컬럼 TC_CD 의 도메인 타입, 값이 없던 PROD_DT 에 숫자 도메인(단위·소수 있음)
        jdbc.update("UPDATE TB_MDM_DOMAIN SET DATA_TYPE = 'STRING', SCALE = 3, UNIT_CODE = 'kg' WHERE DOMAIN_ID = ?", parent);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET DATA_TYPE = 'NUMBER' WHERE DOMAIN_ID = "
                + "(SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'TC_CD')");
        long gained = domainWithUnit("PIN_GAINED", "NUMBER", 8, 2, "kg");
        jdbc.update("UPDATE TB_MDM_COLUMN SET DOMAIN_ID = ? WHERE PHYS_NAME = 'PROD_DT'", gained);
        assertThat(compositions(m)).isEqualTo(before);
        MdmLayoutItemSnapshot releasedDt = bodyItem(composer.compose(m.message(), new BigDecimal("1.000"), TIMES.get(1)), "PROD_DT");
        assertThat(releasedDt.dataType()).isEqualTo(MdmLayoutItemType.CHAR); // "값 없음" 으로 고정된 칸은 새 사전 값을 읽지 않는다
        assertThat(releasedDt.unitCode()).isNull();
        assertThat(releasedDt.scale()).isNull();

        // DRAFT 는 지금 사전 값이다
        MdmLayoutItemSnapshot draftThk = bodyItem(composer.compose(m.message(), new BigDecimal("2.000"), TIMES.get(1)), "COIL_THK");
        assertThat(draftThk.dataType()).isEqualTo(MdmLayoutItemType.CHAR);
        assertThat(draftThk.unitCode()).isEqualTo("kg");
        assertThat(draftThk.scale()).isEqualTo(3);
        assertThat(bodyItem(composer.compose(m.message(), new BigDecimal("2.000"), TIMES.get(1)), "PROD_DT").dataType())
                .isEqualTo(MdmLayoutItemType.NUM);
        MdmLayoutItemSnapshot releasedThk = bodyItem(composer.compose(m.message(), new BigDecimal("1.000"), TIMES.get(1)), "COIL_THK");
        assertThat(releasedThk.dataType()).isEqualTo(MdmLayoutItemType.NUM);
        assertThat(releasedThk.unitCode()).isEqualTo("mm");
        assertThat(releasedThk.scale()).isEqualTo(1);
    }

    /** 시각 T 합성·피드 구간·헤더 한 벌 — 전문 RELEASED 1.000 과 헤더 둘. */
    private Map<String, Object> compositions(M201 m) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (LocalDateTime t : TIMES) {
            out.put("at " + t, composer.at(m.message(), t));
        }
        out.put("timeline", timeline.released(m.message()));
        out.put("l100", composer.headerAlone(m.l100(), new BigDecimal("1.000")));
        out.put("l110", composer.headerAlone(m.l110(), new BigDecimal("1.000")));
        return out;
    }

    private static MdmLayoutItemSnapshot bodyItem(MdmLayoutSnapshot s, String phys) {
        return s.items().stream().filter(i -> phys.equals(i.columnPhys())).findFirst().orElseThrow();
    }

    /** {@code SEQ:물리명=고정표시:타입|단위|소수}. */
    private List<String> pins(long layoutId, String ver) {
        return jdbc.queryForList("SELECT SEQ || ':' || COALESCE(COLUMN_PHYS, '-') || '=' || PINNED_YN || ':' || COALESCE(DATA_TYPE, '-') || '|' "
                + "|| COALESCE(UNIT_CODE, '-') || '|' || COALESCE(CAST(SCALE AS VARCHAR(10)), '-') FROM TB_MDM_LAYOUT_ITEM "
                + "WHERE LAYOUT_ID = ? AND VER = ? ORDER BY SEQ", String.class, layoutId, new BigDecimal(ver));
    }

    /** V22 파일의 「채움 시작」~「채움 끝」 블록을 문장마다 돌린다(블록 안 주석에는 문장 끝 기호가 없다). */
    private void runFill() {
        String sql;
        try (InputStream in = Objects.requireNonNull(getClass().getClassLoader().getResourceAsStream(V22), V22)) {
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        String block = sql.substring(sql.indexOf("-- [V22 채움 시작]"), sql.indexOf("-- [V22 채움 끝]"));
        String body = block.lines().filter(l -> !l.trim().startsWith("--")).collect(Collectors.joining("\n"));
        List<String> statements = new ArrayList<>();
        for (String s : body.split(";")) {
            if (!s.isBlank()) {
                statements.add(s);
            }
        }
        assertThat(statements).hasSize(5); // 사슬 표·유효값 표·UPDATE·임시 표 둘 DROP
        statements.forEach(jdbc::execute);
    }
}
