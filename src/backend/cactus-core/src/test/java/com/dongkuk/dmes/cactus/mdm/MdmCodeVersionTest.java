package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlicer;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import org.junit.jupiter.api.Test;

/** D-154 — 코드 본문 값과 색인(스펙 §5.3). 전체(all) 카테고리는 items 코드 집합 한 벌을 공유하고, 본문에 없는 cateId 는 빈 집합이다. */
class MdmCodeVersionTest {

    static final BigDecimal V1 = new BigDecimal("1.000");
    static final BigDecimal OPEN = new BigDecimal("9999.000");

    /** 코드 A·B, BASE(.*)·ALL2(.*)·TB(TABLE: B). */
    static CodeRows rows() {
        return new CodeRows(new CodeHeader("MC_CD", "INUSE"),
                List.of(new CodeVersionRow(V1, "RELEASED", LocalDateTime.of(2026, 1, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(item("A"), item("B")),
                List.of(new CodeCateRow("BASE", V1, OPEN, "REGEX", ".*", "CODE"), new CodeCateRow("ALL2", V1, OPEN, "REGEX", ".*", "CODE"),
                        new CodeCateRow("TB", V1, OPEN, "TABLE", null, null)),
                List.of(new CodeCateItemRow("TB", "B", V1, OPEN)));
    }

    static CodeItemRow item(String code) {
        return new CodeItemRow(code, V1, OPEN, code + " 이름", null, 1, Arrays.asList(new String[5]), Arrays.asList(new String[10]));
    }

    static MdmCodeVersion sliced() {
        CodeRows p = CodeRowsProjection.releasedOnly(rows());
        CodeVersionSlice slice = CodeVersionSlicer.slice(p, V1);
        CodeVersionRow v = p.versions().get(0);
        return MdmCodeVersion.sliced(slice, p.header(), new MdmTocVersion(v.ver(), v.status(), v.applyFrom(), v.applyTo()));
    }

    @Test
    void 색인은_소속_집합을_주고_all_은_한_벌을_공유하며_없는_cateId_는_빈_집합이다() {
        MdmCodeVersion c = sliced();
        assertThat(c.isSliced()).isTrue();
        assertThat(c.members("TB")).contains(Set.of("B"));
        assertThat(c.members("BASE")).contains(Set.of("A", "B"));
        assertThat(c.members("BASE").get()).isSameAs(c.members("ALL2").get());
        assertThat(c.members("NO_SUCH")).contains(Set.of());
    }

    @Test
    void rows_는_그_버전_1행과_합성_cateItems_를_담는다() {
        CodeRows r = sliced().rows();
        assertThat(r.versions()).hasSize(1);
        assertThat(r.cateItems()).extracting(CodeCateItemRow::code).containsExactly("B");
    }

    @Test
    void full_은_전체_행을_그대로_주고_소속은_계산하지_않았다는_빈_값이다() {
        CodeRows rows = rows();
        MdmCodeVersion f = MdmCodeVersion.full(rows);
        assertThat(f.isSliced()).isFalse();
        assertThat(f.rows()).isSameAs(rows);
        assertThat(f.members("TB")).isEmpty();
    }

    @Test
    void JSON_은_본문_slice_모양이다_추정_크기와_관리_화면_상세가_쓴다() throws Exception {
        String json = MdmJson.MAPPER.writeValueAsString(sliced());
        assertThat(json).contains("\"maruCodeId\":\"MC_CD\"").contains("\"categories\"").doesNotContain("cateItems");
        assertThat(MdmJson.MAPPER.writeValueAsString(MdmCodeVersion.full(rows()))).contains("\"cateItems\"");
    }
}
