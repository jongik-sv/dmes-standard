package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdStreamController;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * ERD 출처(source) 규칙 — 클래스마다 규칙이 다르다. 상수를 한 곳으로 옮겨도 각 규칙은 그대로여야 한다(C8 S8).
 * 옮길 상수를 참조하지 않고 글자 그대로 쓴다. 저장소·허브는 시험 대역이다.
 */
class ErdSourceRulesTest {

    private static final String MODEL = "mcm";

    private ErdModelStore store;
    private ErdCommandService service;

    @BeforeEach
    void setUp() {
        store = mock(ErdModelStore.class);
        ErdCommandLogStore log = mock(ErdCommandLogStore.class);
        PlatformTransactionManager ptm = mock(PlatformTransactionManager.class);
        service = new ErdCommandService(store, mock(ErdDiagramStore.class), log, mock(ErdDictionaryLoader.class),
                mock(VersionWriteGuard.class), mock(ErdEventHub.class), mock(ErdCoEditors.class),
                ptm, mock(EntityManager.class), new ErdChangeFeed(store, log, ptm));
    }

    private static List<JsonNode> oneCommand() {
        return List.of(ErdModelCodec.MAPPER.createObjectNode().put("op", "addTable"));
    }

    /** 명령 입구는 UI·MCP·CLI 글자 그대로만 받는다 — 다듬기·대소문자 바꾸기 없음, null·SYSTEM 도 거절. */
    @Test
    void commandServiceRejectsSourceOutsideExactSet() {
        for (String source : Arrays.asList("mcp", " MCP", "SYSTEM", "WEB", null)) {
            ErdApplyResult r = service.apply(MODEL, 0, "owner", "s", source, oneCommand());

            assertThat(r.applied()).as(String.valueOf(source)).isFalse();
            assertThat(r.rejection().code()).as(String.valueOf(source)).isEqualTo("INVALID");
            assertThat(r.rejection().message()).as(String.valueOf(source)).contains("source 는 UI·MCP·CLI");
        }
        verify(store, never()).lockRev(anyString());
    }

    /** UI·MCP·CLI 는 출처 검사를 지나 다음 검사(묶음 크기)에 닿는다. */
    @Test
    void commandServiceAcceptsExactSourcesAndReachesBatchSizeCheck() {
        for (String source : List.of("UI", "MCP", "CLI")) {
            ErdApplyResult r = service.apply(MODEL, 0, "owner", "s", source, List.of());

            assertThat(r.applied()).as(source).isFalse();
            assertThat(r.rejection().code()).as(source).isEqualTo("INVALID");
            assertThat(r.rejection().message()).as(source).contains("명령은 1~");
        }
        verify(store, never()).lockRev(anyString());
    }

    /** 검사 순서: userId → session → source → 묶음 크기. */
    @Test
    void sourceIsCheckedAfterUserAndSessionAndBeforeBatchSize() {
        assertThat(service.apply(MODEL, 0, " ", "s", "WEB", List.of()).rejection().message()).contains("userId");
        assertThat(service.apply(MODEL, 0, "owner", " ", "WEB", List.of()).rejection().message()).contains("session");
        assertThat(service.apply(MODEL, 0, "owner", "s", "WEB", List.of()).rejection().message())
                .contains("source 는 UI·MCP·CLI");
    }

    /** 시한 접속자 출처는 MCP·CLI 글자 그대로뿐이다. */
    @Test
    void timedSourceIsExactlyMcpOrCli() {
        assertThat(ErdEventHub.isTimedSource("MCP")).isTrue();
        assertThat(ErdEventHub.isTimedSource("CLI")).isTrue();
        for (String source : Arrays.asList("UI", "mcp", " MCP", "SYSTEM", null)) {
            assertThat(ErdEventHub.isTimedSource(source)).as(String.valueOf(source)).isFalse();
        }
    }

    /** 실시간 채널은 source 를 검사하지 않고 그대로 허브에 넘긴다. */
    @Test
    void streamPassesSourceRawToHub() {
        ErdEventHub hub = mock(ErdEventHub.class);
        MdmCurrentUser user = mock(MdmCurrentUser.class);
        when(user.userId()).thenReturn("u1");

        new ErdStreamController(hub, user).stream("m", "s", -1, "web");

        verify(hub).subscribe("m", "s", "u1", "web", -1L);
    }

    /** source 를 빼면 UI 다. */
    @Test
    void streamSourceDefaultsToUi() throws Exception {
        Method m = ErdStreamController.class.getMethod("stream", String.class, String.class, long.class, String.class);

        RequestParam p = m.getParameters()[3].getAnnotation(RequestParam.class);

        assertThat(p).isNotNull();
        assertThat(p.defaultValue()).isEqualTo("UI");
    }

    /** 표시 행은 출처가 SYSTEM 글자 그대로일 때뿐이다. */
    @Test
    void markerIsExactlySystemSource() {
        assertThat(ErdDelta.isMarker(new ErdDelta(MODEL, 1, "u", "system", "SYSTEM", List.of()))).isTrue();
        for (String source : Arrays.asList("system", "UI", null)) {
            assertThat(ErdDelta.isMarker(new ErdDelta(MODEL, 1, "u", "s", source, List.of())))
                    .as(String.valueOf(source)).isFalse();
        }
    }
}
