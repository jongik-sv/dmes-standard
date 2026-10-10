package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 빈 칸 채우기와 rowVersion(S2-12·S2-16) — DB 없이. 다른 트랜잭션의 afterCommit 이 늦게 와서 큐 맨 앞(rev 2) 앞에 빈 칸이 생기면,
 * 명령 기록(rowVersion 없음)으로 채우는 것은 맨 앞보다 앞 rev 뿐이고, 큐에 이미 들어온 실시간 델타는 rowVersion 을 실은 채 나간다.
 */
class ErdEventHubGapRowVersionTest {

    static final class RecordingEmitter extends SseEmitter {
        final List<String> events = new CopyOnWriteArrayList<>();

        RecordingEmitter() {
            super(0L);
        }

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            StringBuilder sb = new StringBuilder();
            for (DataWithMediaType d : builder.build()) sb.append(d.getData());
            String text = sb.toString();
            String name = text.substring(text.indexOf("event:") + 6, text.indexOf('\n', text.indexOf("event:"))).trim();
            events.add(name + "|" + text.substring(text.indexOf("data:") + 5).trim());
        }
    }

    ErdEventHub hub;

    @AfterEach
    void close() {
        if (hub != null) hub.close();
    }

    private static ErdDelta live(long rev, long rowVersion) {
        return new ErdDelta("m", rev, "u", "s", "UI", rowVersion, List.of());
    }

    private static ErdDelta logged(long rev) {
        return new ErdDelta("m", rev, "u", "s", "UI", List.of());
    }

    @Test
    @SuppressWarnings("unchecked")
    void gapFillKeepsLiveRowVersionOfQueuedDeltas() throws Exception {
        CountDownLatch reading = new CountDownLatch(1);
        CountDownLatch queued = new CountDownLatch(1);
        ErdCommandService commands = mock(ErdCommandService.class);
        when(commands.changesSince(anyString(), anyLong())).thenAnswer(inv -> {
            reading.countDown();
            queued.await(5, TimeUnit.SECONDS);                       // 읽는 사이에 rev 1·3 의 afterCommit 이 온다
            return new ErdChangesView(3, false, List.of(logged(1), logged(2), logged(3)));
        });
        ObjectProvider<ErdCommandService> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(commands);
        hub = new ErdEventHub(provider, null);
        RecordingEmitter e = new RecordingEmitter();
        hub.attachForTest("m", "a", e, 0);

        hub.publish(live(2, 12));                                   // rev 1 보다 먼저 왔다 → 빈 칸 채우기
        assertThat(reading.await(5, TimeUnit.SECONDS)).isTrue();
        hub.publish(live(1, 11));
        hub.publish(live(3, 13));
        queued.countDown();

        long until = System.currentTimeMillis() + 5_000;
        while (e.events.size() < 3 && System.currentTimeMillis() < until) Thread.sleep(20);
        Thread.sleep(200);                                          // 더 나가지 않는지
        assertThat(e.events).hasSize(3);
        for (int i = 0; i < 3; i++) {
            assertThat(e.events.get(i)).startsWith("change|")
                    .contains("\"rev\":" + (i + 1) + ",").contains("\"rowVersion\":" + (11 + i));
        }
    }
}
