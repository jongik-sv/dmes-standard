package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** D-154 — 본문 키의 ver 는 늘 scale 3 문자열(스펙 §3.1). 논리 키는 마지막 {@code @} + scale 3 숫자로만 푼다. */
class MdmVersionsTest {

    @Test
    void key_는_자리수가_달라도_같은_scale_3_문자열이다() {
        assertThat(MdmVersions.key(new BigDecimal("1"))).isEqualTo("1.000");      // SQLite INTEGER
        assertThat(MdmVersions.key(new BigDecimal("1.0"))).isEqualTo("1.000");
        assertThat(MdmVersions.key(new BigDecimal("1.0010"))).isEqualTo("1.001");
        assertThat(MdmVersions.key(new BigDecimal("1.001"))).isEqualTo("1.001");  // SQLite REAL
        assertThat(MdmVersions.key("2")).isEqualTo("2.000");
        assertThat(MdmVersions.key(new BigDecimal("1E+1"))).isEqualTo("10.000");
    }

    @Test
    void key_는_소수_넷째_자리가_있거나_숫자가_아니면_거부한다() {
        assertThatThrownBy(() -> MdmVersions.key(new BigDecimal("1.0001"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> MdmVersions.key("x.y")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 논리_키는_마지막_골뱅이와_scale_3_숫자로만_푼다() {
        assertThat(MdmVersions.parse("PROC_CD@1.000")).isEqualTo(new MdmVersions.LogicalKey("PROC_CD", "1.000"));
        assertThat(MdmVersions.parse("A@B@2.010")).isEqualTo(new MdmVersions.LogicalKey("A@B", "2.010"));
        assertThat(MdmVersions.parse("A@1")).isEqualTo(new MdmVersions.LogicalKey("A@1", null));
        assertThat(MdmVersions.parse("PROC_CD")).isEqualTo(new MdmVersions.LogicalKey("PROC_CD", null));
        assertThat(MdmVersions.parse("42@1.000").isBody()).isTrue();
        assertThat(MdmVersions.logical("PROC_CD", "1.000")).isEqualTo("PROC_CD@1.000");
        assertThat(MdmVersions.logical("PROC_CD", null)).isEqualTo("PROC_CD");
    }

    @Test
    void 버전_대상은_룰_룰세트_코드_전문이다() {
        assertThat(MdmVersions.isVersioned(MdmTargetType.CODE)).isTrue();
        assertThat(MdmVersions.isVersioned(MdmTargetType.LAYOUT)).isTrue();
        assertThat(MdmVersions.isVersioned(MdmTargetType.COLUMN)).isFalse();
        assertThat(MdmVersions.isVersioned(MdmTargetType.DOMAIN)).isFalse();
    }
}
