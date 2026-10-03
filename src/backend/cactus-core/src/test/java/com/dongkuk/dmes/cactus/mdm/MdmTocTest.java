package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** D-154 — 목차 값(스펙 §3.1): ver 키 찾기(자리수 정규화)·엔진 목차 행·JSON 왕복·같음. 선택이 status 를 다루는 방식도 고정한다. */
class MdmTocTest {

    private static final LocalDateTime FROM = LocalDateTime.parse("2026-01-01T00:00:00");
    private static final LocalDateTime MID = LocalDateTime.parse("2026-06-01T00:00:00");

    private static MdmToc mixed() {
        // SQLite 는 1.000 을 INTEGER(2), 1.001 을 REAL 로 준다 — 자리수가 섞인 ver
        return new MdmToc(new CodeHeader("C", "INUSE"), List.of(
                new MdmTocVersion(new BigDecimal("1.0010"), "RELEASED", FROM, MID),
                new MdmTocVersion(new BigDecimal("2"), "RELEASED", MID, null)));
    }

    @Test
    void 자리수가_섞인_ver_도_scale_3_키로_찾는다() {
        MdmToc toc = mixed();
        assertThat(toc.version("2.000")).map(MdmTocVersion::ver).contains(new BigDecimal("2"));
        assertThat(toc.version("1.001")).map(MdmTocVersion::ver).contains(new BigDecimal("1.0010"));
        assertThat(toc.version("2")).as("키는 scale 3 문자열만").isEmpty();
        assertThat(toc.version("3.000")).isEmpty();
    }

    @Test
    void 엔진_목차_행은_목차와_같은_순서이고_항목은_비어_있다() {
        MdmToc toc = mixed();
        assertThat(toc.codeRows().header()).isEqualTo(new CodeHeader("C", "INUSE"));
        assertThat(toc.codeRows().versions()).extracting(CodeVersionRow::ver).containsExactly(new BigDecimal("1.0010"), new BigDecimal("2"));
        assertThat(toc.codeRows().items()).isEmpty();
        assertThat(toc.codeRows().categories()).isEmpty();
        assertThat(toc.codeRows().cateItems()).isEmpty();
    }

    @Test
    void JSON_은_header_versions_만_왕복하고_정수_ver_도_찾는다() throws Exception {
        MdmToc toc = mixed();
        String json = MdmJson.MAPPER.writeValueAsString(toc);
        assertThat(MdmJson.MAPPER.readTree(json).fieldNames()).toIterable().containsExactlyInAnyOrder("header", "versions");

        MdmToc back = MdmJson.MAPPER.readValue(json, MdmToc.class);
        assertThat(back).isEqualTo(toc);
        assertThat(back.hashCode()).isEqualTo(toc.hashCode());
        assertThat(back.header()).isEqualTo(toc.header());
        assertThat(back.versions()).isEqualTo(toc.versions());

        MdmToc integer = MdmJson.MAPPER.readValue("{\"header\":null,\"versions\":[{\"ver\":2,\"status\":\"RELEASED\","
                + "\"applyFrom\":\"2026-06-01T00:00:00\",\"applyTo\":null}]}", MdmToc.class);
        assertThat(integer.version("2.000")).isPresent();
        assertThat(integer.header()).isNull();
    }

    @Test
    void 버전_목록이_null_이면_빈_목차다() {
        MdmToc empty = new MdmToc(null, null);
        assertThat(empty.versions()).isEmpty();
        assertThat(empty.codeRows().versions()).isEmpty();
        assertThat(empty).isEqualTo(new MdmToc(null, List.of()));
    }

    @Test
    void 코드_선택은_CANCELLED_를_거르고_룰_세트_전문_선택은_status_를_보지_않는다() {
        MdmToc toc = new MdmToc(new CodeHeader("C", "INUSE"), List.of(
                new MdmTocVersion(new BigDecimal("1.000"), "RELEASED", FROM, null),
                new MdmTocVersion(new BigDecimal("2.000"), "CANCELLED", MID, null)));
        LocalDateTime later = LocalDateTime.parse("2030-01-01T00:00:00");
        assertThat(MdmVersionSelector.select(MdmTargetType.CODE, toc, later)).as("엔진 CodeVersions 가 CANCELLED 를 거른다").contains("1.000");
        assertThat(MdmVersionSelector.select(MdmTargetType.RULE, toc, later))
                .as("룰·세트·전문은 목차가 RELEASED 만 싣는다는 계약(MdmTocVersion)에 기댄다").contains("2.000");
    }
}
