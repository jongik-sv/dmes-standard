package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class ErdHintsLoaderTest {

    final ErdHintsLoader loader = new ErdHintsLoader();

    @Test
    void readsNestedRefsIntoFlatRecordsAndUpperCasesNames() {
        ErdHints h = loader.load("test-ok");
        assertThat(h.refs()).containsExactly(
                new ErdHints.Ref("DOC", "TB_MCM_SEC_MENU", List.of("OBJECT_ID"), "TB_MCM_SEC_OBJ", List.of("OBJECT_ID"),
                        "docs/mcm/erd/csa-menu.dbml:494"),
                new ErdHints.Ref("SQL_JOIN", "TB_MCM_SEC_USER_WIDGET", List.of("USER_ID", "TAB_ID"), "TB_MCM_SEC_USER_WIDGET_TAB",
                        List.of("USER_ID", "TAB_ID"), "src/backend/mcm/X.java:12"));
    }

    @Test
    void missingFileIsEmpty() {
        assertThat(loader.load("no-such-module")).isEqualTo(ErdHints.EMPTY);
    }

    @Test
    void malformedFileFails() {
        assertThatThrownBy(() -> loader.load("test-bad")).isInstanceOf(IllegalStateException.class).hasMessageContaining("kind");
        assertThatThrownBy(() -> loader.load("test-broken")).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("erd-hints.mjs");
    }

    @Test
    void moduleNameIsValidated() {
        assertThatThrownBy(() -> loader.load("../secret")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> loader.load("")).isInstanceOf(IllegalArgumentException.class);
    }
}
