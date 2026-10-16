package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHubQueueTest.RecordingEmitter;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 모델 완전 삭제 알림(ERD 2차 §7.2) — DB 없이. 그 모델의 구독자마다 reload{rev} 하나 뒤 스트림을 닫고, 접속자(시한 항목 포함)를 지운다.
 * 다른 모델의 구독은 그대로다.
 */
class ErdEventHubModelDeletedTest {

    final ErdEventHub hub = new ErdEventHub(null, null, null);

    @AfterEach
    void close() {
        hub.close();
    }

    private static void await(BooleanSupplier cond, String what) throws InterruptedException {
        long end = System.currentTimeMillis() + 5_000;
        while (!cond.getAsBoolean()) {
            if (System.currentTimeMillis() > end) throw new AssertionError(what);
            Thread.sleep(20);
        }
    }

    /**
     * 재생 읽기 중에 모델이 지워졌다(읽기가 ERD_MODEL_NOT_FOUND). 오류로 끊지 않고 reload 뒤 닫는다 — 화면이 아는 길(다시 읽기 → MDM029)이다.
     * rev 는 허브가 아는 삭제 rev, 모르면 sinceRev + 1.
     */
    @Test
    void deleteDuringReplaySendsReloadInsteadOfError() throws Exception {
        ErdChangeSource changes = mock(ErdChangeSource.class);
        when(changes.changesSince("m", 3L)).thenThrow(MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
        JdbcTemplate jdbc = new JdbcTemplate() {
            @Override
            @SuppressWarnings("unchecked")
            public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
                return sql.contains("TB_MDM_ERD_CLAIM") ? List.of() : (List<T>) List.of(5L); // 작업 중 표시 없음, REV 5
            }
        };
        RecordingEmitter e = new RecordingEmitter(null);
        ErdEventHub h = new ErdEventHub(changes, null, jdbc) {
            @Override
            SseEmitter newEmitter() {
                return e;
            }
        };
        try {
            h.subscribe("m", "ui-a", "u", "UI", 3);
            await(() -> e.completed, "구독이 닫히지 않았습니다");
            assertThat(e.events).isNotEmpty();
            assertThat(e.events.get(e.events.size() - 1)).isEqualTo("reload|{\"rev\":4}");
            await(() -> h.subscriberCount("m") == 0, "구독이 목록에 남았습니다");
        } finally {
            h.close();
        }
    }

    @Test
    void subscribersGetReloadThenStreamClosesAndPresenceIsCleared() throws Exception {
        RecordingEmitter a = new RecordingEmitter(null), b = new RecordingEmitter(null), other = new RecordingEmitter(null);
        hub.attachForTest("m", "ui-a", a, 3);
        hub.attachForTest("m", "ui-b", b, 3);
        hub.attachForTest("x", "ui-x", other, 0);
        hub.touch("m", "cli-1", "u", "CLI", null);                      // MCP·CLI 시한 접속자
        assertThat(hub.presence("m")).extracting(ErdPresence::session).containsExactly("cli-1");
        await(() -> a.events.size() == 1 && b.events.size() == 1, "presence 방송이 오지 않았습니다");   // 삭제 전 방송은 먼저 나간다

        hub.modelDeleted("m", 4);                                        // 트랜잭션 밖이면 바로 돈다

        await(() -> a.completed && b.completed, "구독이 닫히지 않았습니다");
        assertThat(a.events).hasSize(2).last().isEqualTo("reload|{\"rev\":4}");
        assertThat(b.events).hasSize(2).last().isEqualTo("reload|{\"rev\":4}");
        await(() -> hub.subscriberCount("m") == 0, "구독이 목록에 남았습니다");
        assertThat(hub.presence("m")).isEmpty();
        // 닫힌 구독에는 더 보내지 않는다
        hub.publish(new ErdDelta("m", 5, "u", "s", "UI", List.of()));
        Thread.sleep(100);
        assertThat(a.events).hasSize(2);
        // 다른 모델은 그대로
        assertThat(other.completed).isFalse();
        assertThat(hub.subscriberCount("x")).isEqualTo(1);
        hub.publish(new ErdDelta("x", 1, "u", "s", "UI", List.of()));
        await(() -> other.events.stream().anyMatch(e -> e.startsWith("change|")), "다른 모델의 델타가 오지 않았습니다");
    }
}
