package com.dongkuk.dmes.cactus.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TxIdGeneratorTest {

    @Test
    void txId_형식이_올바르다() {
        String txId = TxIdGenerator.generate("user01", "PROD001");

        // 형식: {userId}-{menuId}-{yyyyMMddHHmmss}-{random3}
        assertThat(txId).startsWith("user01-PROD001-");
        String[] parts = txId.split("-");
        assertThat(parts).hasSizeGreaterThanOrEqualTo(4);
    }

    @Test
    void userId가_null이면_anon으로_대체된다() {
        String txId = TxIdGenerator.generate(null, "SC001");

        assertThat(txId).startsWith("anon-SC001-");
    }

    @Test
    void menuId가_null이면_NONE으로_대체된다() {
        String txId = TxIdGenerator.generate("user01", null);

        assertThat(txId).contains("-NONE-");
    }

    @Test
    void 매번_다른_txId가_생성된다() {
        String txId1 = TxIdGenerator.generate("user01", "SC001");
        String txId2 = TxIdGenerator.generate("user01", "SC001");

        // 타임스탬프가 같아도 random 3자리가 다를 확률이 높다
        // 극히 드물게 같을 수 있으므로 여러 번 생성해서 검증
        boolean allSame = true;
        for (int i = 0; i < 10; i++) {
            if (!TxIdGenerator.generate("u", "m").equals(TxIdGenerator.generate("u", "m"))) {
                allSame = false;
                break;
            }
        }
        assertThat(allSame).isFalse();
    }
}
