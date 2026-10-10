package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ErdModelCodecTest {

    static final String JSON = """
        {"schemaVersion":1,"model":{"module":"mcm","schema":"MCMAPUSER"},
         "tables":{"t-1":{"phys":"TB_MCM_SEC_MENU","logical":"메뉴","comment":"","columnOrder":["c-1"],
                          "_rev":{"logical":{"rev":213,"session":"claude-erd-a"}}}},
         "columns":{"c-1":{"table":"t-1","phys":"MENU_ID","logical":"메뉴아이디","domainId":12,"dataType":"VARCHAR2",
                           "length":30,"scale":null,"notNull":true,"default":null,"comment":"","_rev":{}}},
         "keys":{"k-1":{"table":"t-1","kind":"PK","name":"PK_TB_MCM_SEC_MENU","columns":["c-1"],"_rev":{}}},
         "relations":{},"_tombstones":{"c-9":{"rev":200,"session":"ui-41000132"}}}
        """;

    @Test
    void readsAndWritesRoundTrip() {
        ErdModel m = ErdModelCodec.read(JSON);
        assertThat(m.tables.get("t-1").rev.get("logical")).isEqualTo(new PropRev(213, "claude-erd-a"));
        assertThat(m.columns.get("c-1").defaultValue).isNull();
        assertThat(m.tombstones).containsKey("c-9");
        ErdModel again = ErdModelCodec.read(ErdModelCodec.write(m));
        assertThat(ErdModelCodec.write(again)).isEqualTo(ErdModelCodec.write(m));
    }

    @Test
    void copyIsDeep() {
        ErdModel m = ErdModelCodec.read(JSON);
        ErdModel c = ErdModelCodec.copy(m);
        c.tables.get("t-1").logical = "바뀜";
        assertThat(m.tables.get("t-1").logical).isEqualTo("메뉴");
    }

    @Test
    void emptyModelHasDefaults() {
        ErdModel m = ErdModel.empty("mcm", "MCMAPUSER");
        assertThat(ErdModelCodec.write(m)).contains("\"schemaVersion\":1").contains("\"_tombstones\":{}");
    }

    @Test
    void candidateRankIsOptional() {
        String withRelation = JSON.replace("\"relations\":{}", """
                "relations":{"r-1":{"child":"t-1","parent":"t-1","pairs":[],"identifying":false,
                  "cardinality":{"parent":"ONE","child":"ZERO_OR_MORE"},"state":"INFERRED","dbFk":false,
                  "evidence":[],"parentRef":null,"_rev":{}}}""");
        ErdModel m = ErdModelCodec.read(withRelation);
        assertThat(m.relations.get("r-1").candidateRank).isNull();
        assertThat(ErdModelCodec.write(m)).doesNotContain("candidateRank");
        m.relations.get("r-1").candidateRank = 2;
        assertThat(ErdModelCodec.write(m)).contains("\"candidateRank\":2");
        assertThat(ErdModelCodec.read(ErdModelCodec.write(m)).relations.get("r-1").candidateRank).isEqualTo(2);
    }

    /** deferred 32: 모르는 스키마 버전의 모델 JSON 은 읽지 않는다. */
    @Test
    void unknownSchemaVersionIsRejected() {
        assertThatThrownBy(() -> ErdModelCodec.read(JSON.replace("\"schemaVersion\":1", "\"schemaVersion\":2")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("모델 JSON schemaVersion 을 모릅니다: 2");
    }
}
