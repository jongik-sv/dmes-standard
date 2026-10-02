package com.dongkuk.dmes.mdm.dmb.layout;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class LayoutVersionsTest {

    private static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    private static MdmLayoutVer released(String ver, LocalDateTime from, LocalDateTime to) {
        MdmLayoutVer v = new MdmLayoutVer(1L, new BigDecimal(ver), VersionKind.MAJOR, null);
        v.setStatus("RELEASED");
        v.setApplyFrom(from);
        v.setApplyTo(to);
        return v;
    }

    private static MdmLayoutVer draft(String ver, String owner) {
        return new MdmLayoutVer(1L, new BigDecimal(ver), VersionKind.MINOR, owner);
    }

    private final List<MdmLayoutVer> all = List.of(
            released("1.000", LocalDateTime.of(2026, 1, 1, 0, 0), JUL1),
            released("1.001", JUL1, LocalDateTime.of(9999, 12, 31, 0, 0)),
            draft("1.002", "kim"));

    @Test
    void releasedAtUsesHalfOpenInterval() {
        assertThat(LayoutVersions.releasedAt(all, JUL1.minusSeconds(1)).orElseThrow().getVer()).isEqualByComparingTo("1.000");
        assertThat(LayoutVersions.releasedAt(all, JUL1).orElseThrow().getVer()).isEqualByComparingTo("1.001");
        assertThat(LayoutVersions.releasedAt(all, LocalDateTime.of(2025, 12, 31, 0, 0))).isEmpty();
    }

    @Test
    void minorOrderingAndPrevious() {
        assertThat(LayoutVersions.sortedDesc(all)).extracting(v -> v.getVer().toPlainString())
                .containsExactly("1.002", "1.001", "1.000");
        assertThat(LayoutVersions.previousReleased(all, new BigDecimal("1.002")).orElseThrow().getVer()).isEqualByComparingTo("1.001");
        assertThat(LayoutVersions.maxVer(all)).isEqualByComparingTo("1.002");
    }

    @Test
    void editTargetPrefersMyDraftThenCurrentRelease() {
        assertThat(LayoutVersions.editTarget(all, "kim", JUL1).getVer()).isEqualByComparingTo("1.002");
        List<MdmLayoutVer> noDraft = all.subList(0, 2);
        assertThat(LayoutVersions.editTarget(noDraft, "kim", JUL1.minusDays(1)).getVer()).isEqualByComparingTo("1.000");
        assertThat(LayoutVersions.state(all.get(1), JUL1.minusDays(1))).isEqualTo("FUTURE");
        assertThat(LayoutVersions.state(all.get(0), JUL1)).isEqualTo("PAST");
        assertThat(LayoutVersions.state(all.get(2), JUL1)).isEqualTo("DRAFT");
        assertThat(LayoutVersions.hasUnapplied(noDraft, JUL1.minusDays(1))).isTrue();
        assertThat(LayoutVersions.hasUnapplied(noDraft, JUL1)).isFalse();
    }
}
