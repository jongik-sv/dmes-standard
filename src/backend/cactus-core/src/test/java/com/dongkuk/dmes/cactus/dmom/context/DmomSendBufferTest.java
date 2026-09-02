package com.dongkuk.dmes.cactus.dmom.context;

import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DmomSendBufferTest {

    @AfterEach
    void cleanup() {
        DmomSendBuffer.close();   // 스레드 누수 방지
    }

    @Test
    void 최초_openIfAbsent_는_bind하고_빈버퍼() {
        assertThat(DmomSendBuffer.isActive()).isFalse();

        List<DmomMessage> buf = DmomSendBuffer.openIfAbsent();

        assertThat(DmomSendBuffer.isActive()).isTrue();
        assertThat(buf).isEmpty();
    }

    @Test
    void 두번째_openIfAbsent_는_같은버퍼() {
        List<DmomMessage> first = DmomSendBuffer.openIfAbsent();
        first.add(new DmomMessage("tc", "if", "a|b|"));

        List<DmomMessage> second = DmomSendBuffer.openIfAbsent();

        assertThat(second).isSameAs(first).hasSize(1);
    }

    @Test
    void close하면_isActive_false() {
        DmomSendBuffer.openIfAbsent();
        DmomSendBuffer.close();
        assertThat(DmomSendBuffer.isActive()).isFalse();
    }

    @Test
    void close는_바인딩없어도_안전() {
        assertThat(DmomSendBuffer.isActive()).isFalse();
        DmomSendBuffer.close();   // no-op, 예외 없음
        assertThat(DmomSendBuffer.isActive()).isFalse();
    }
}
