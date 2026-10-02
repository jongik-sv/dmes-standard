package com.dongkuk.dmes.mdm.common.rule.confirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import org.junit.jupiter.api.Test;

class RuleSetVersionDiffsTest {

    @Test
    void nodeAndEdgeChangesAreKeyedById() {
        Map<String, DiffKind> kinds = RuleSetVersionDiffs.diff(FlowParser.linear(List.of("R_A")), FlowParser.linear(List.of("R_B", "R_C")))
                .stream().collect(Collectors.toMap(VersionDiffEntry::key, VersionDiffEntry::kind));
        assertThat(kinds).containsEntry("NODE:start", DiffKind.SAME)
                .containsEntry("NODE:r1", DiffKind.CHANGED)
                .containsEntry("NODE:r2", DiffKind.ADDED)
                .containsEntry("EDGE:e2", DiffKind.CHANGED)
                .containsEntry("EDGE:e3", DiffKind.ADDED);
    }

    @Test
    void firstVersionIsAllAddedAndRemovedNodesAreReported() {
        assertThat(RuleSetVersionDiffs.diff(null, FlowParser.linear(List.of("R_A")))).extracting(VersionDiffEntry::kind).containsOnly(DiffKind.ADDED);
        List<VersionDiffEntry> removed = RuleSetVersionDiffs.diff(FlowParser.linear(List.of("R_A", "R_B")), FlowParser.linear(List.of("R_A")));
        VersionDiffEntry r2 = removed.stream().filter(e -> e.key().equals("NODE:r2")).findFirst().orElseThrow();
        assertThat(r2.kind()).isEqualTo(DiffKind.REMOVED);
        assertThat(r2.oldValues()).containsEntry("ruleId", "R_B");
        assertThat(r2.newValues()).isNull();
    }
}
