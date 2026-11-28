package com.dongkuk.dmes.mdm.internal.userOwnership;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdVersionEvent;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdVersionReader;
import com.dongkuk.dmes.mdm.internal.userOwnership.UserOwnershipKind.IdType;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverItem;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverRequest;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipSummaryItem;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.UserRef;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

/**
 * 퇴직 처리 서비스 — 건수 모으기(0 건 빼기·순서·중복 사용자), 넘기기 검증·순서·감사 값·ERD 방송, 실패 시 전부 되돌리기를 고정한다.
 * 저장소·허브·트랜잭션 관리자는 가짜다. SQL 은 {@code UserOwnershipHttpTest}(Oracle)가 본다.
 */
class UserOwnershipServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-28T01:00:00Z");

    private final UserOwnershipStore store = mock(UserOwnershipStore.class);
    private final ErdEventHub hub = mock(ErdEventHub.class);
    private final ErdVersionReader versions = mock(ErdVersionReader.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final TransactionStatus txStatus = mock(TransactionStatus.class);
    private final UserOwnershipService service = new UserOwnershipService(txManager, store, hub, versions,
            Clock.fixed(NOW, ZoneId.of("Asia/Seoul")));

    private static OwnershipHandoverRequest handover(String from, String to) {
        return new OwnershipHandoverRequest(from, "1001", to, "2002");
    }

    // ── summary ─────────────────────────────────────────────────────────────

    @Test
    void 건수는_요청한_사용자_순_그안에서_종류_선언_순이고_0건은_뺀다() {
        when(store.count(any(), anyList(), any())).thenReturn(Map.of());
        when(store.count(eq(UserOwnershipKind.TERM_OWNER), anyList(), any())).thenReturn(Map.of("u1", 2L));
        when(store.count(eq(UserOwnershipKind.CODE_OWNER), anyList(), any())).thenReturn(Map.of("u1", 12L, "u2", 1L));
        when(store.count(eq(UserOwnershipKind.ERD_CLAIM), anyList(), any())).thenReturn(Map.of("u2", 3L, "u1", 0L));

        List<OwnershipSummaryItem> items = service.summary(List.of(new UserRef("u2", null), new UserRef("u1", "1234")));

        assertEquals(List.of(
                new OwnershipSummaryItem("u2", "CODE_OWNER", "코드 초안 소유", 1),
                new OwnershipSummaryItem("u2", "ERD_CLAIM", "ERD 작업 중 표시", 3),
                new OwnershipSummaryItem("u1", "CODE_OWNER", "코드 초안 소유", 12),
                new OwnershipSummaryItem("u1", "TERM_OWNER", "용어 소유자", 2)), items);
    }

    @Test
    void 모든_종류를_한_번씩_묻고_빈_사용자는_버리고_같은_사용자는_한_번만_묻는다() {
        when(store.count(any(), anyList(), any())).thenReturn(Map.of());

        service.summary(Arrays.asList(new UserRef(" u1 ", null), new UserRef("", "9"), null, new UserRef("u1", "1"), new UserRef("u2", null)));

        for (UserOwnershipKind kind : UserOwnershipKind.values()) {
            verify(store).count(kind, List.of("u1", "u2"), NOW);
        }
    }

    @Test
    void 사용자가_없으면_묻지_않고_빈_목록이다() {
        assertEquals(List.of(), service.summary(null));
        assertEquals(List.of(), service.summary(List.of(new UserRef(" ", "1"))));
        verifyNoInteractions(store);
    }

    // ── handover ────────────────────────────────────────────────────────────

    @Test
    void 사용자_ID_가_비었거나_같으면_거절하고_아무것도_하지_않는다() {
        assertThrows(UserOwnershipService.InvalidRequest.class, () -> service.handover(null));
        assertThrows(UserOwnershipService.InvalidRequest.class, () -> service.handover(handover(" ", "u2")));
        assertThrows(UserOwnershipService.InvalidRequest.class, () -> service.handover(handover("u1", null)));
        assertThrows(UserOwnershipService.InvalidRequest.class, () -> service.handover(handover("u1", " u1 ")));
        verifyNoInteractions(store, hub, txManager);
    }

    @Test
    void 종류_선언_순으로_넘기고_작업_중_표시는_지우고_모든_종류를_돌려준다() {
        when(txManager.getTransaction(any())).thenReturn(txStatus);
        when(store.erdDraftModelsOf("u1")).thenReturn(List.of());
        when(store.reassign(eq(UserOwnershipKind.CODE_OWNER), eq("u1"), eq("u2"), any())).thenReturn(4);
        when(store.reassign(eq(UserOwnershipKind.ERD_EDITOR), eq("u1"), eq("u2"), any())).thenReturn(2);
        when(hub.releaseAllOf("u1")).thenReturn(5);

        List<OwnershipHandoverItem> items = service.handover(handover(" u1", "u2 "));

        List<OwnershipHandoverItem> expected = new ArrayList<>();
        for (UserOwnershipKind kind : UserOwnershipKind.values()) {
            long cnt = switch (kind) {
                case CODE_OWNER -> 4;
                case ERD_EDITOR -> 2;
                case ERD_CLAIM -> 5;
                default -> 0;
            };
            expected.add(new OwnershipHandoverItem(kind.name(), kind.label(), cnt, false));
        }
        assertEquals(expected, items);

        InOrder order = inOrder(txManager, store, hub);
        order.verify(txManager).getTransaction(any());
        order.verify(store).erdDraftModelsOf("u1"); // 넘기기 전에 모델을 골라 둔다
        for (UserOwnershipKind kind : UserOwnershipKind.values()) {
            if (kind == UserOwnershipKind.ERD_CLAIM) {
                order.verify(hub).releaseAllOf("u1");
            } else {
                order.verify(store).reassign(eq(kind), eq("u1"), eq("u2"), any());
            }
        }
        order.verify(txManager).commit(txStatus);
        verify(store, never()).reassign(eq(UserOwnershipKind.ERD_CLAIM), any(), any(), any());
    }

    @Test
    void 감사_값은_system_mcm_과_고정_서비스_동작_이름이다() {
        when(txManager.getTransaction(any())).thenReturn(txStatus);
        when(store.erdDraftModelsOf("u1")).thenReturn(List.of());

        service.handover(handover("u1", "u2"));

        ArgumentCaptor<AuditStamp> stamp = ArgumentCaptor.forClass(AuditStamp.class);
        verify(store).reassign(eq(UserOwnershipKind.CODE_OWNER), eq("u1"), eq("u2"), stamp.capture());
        assertEquals(new AuditStamp("system:mcm", "userOwnership", "handover", NOW), stamp.getValue());
    }

    @Test
    void 소유자_편집자가_바뀐_ERD_모델은_넘긴_뒤_버전_이벤트를_보낸다() {
        when(txManager.getTransaction(any())).thenReturn(txStatus);
        when(store.erdDraftModelsOf("u1")).thenReturn(List.of("M1", "M2"));
        ErdVersionEvent m1 = new ErdVersionEvent("M1", "2", "DRAFT", "u2", List.of(), 3, "HANDOVER", "system:mcm", NOW.toString());
        when(versions.versionNow("M1", "HANDOVER", "system:mcm")).thenReturn(m1);
        when(versions.versionNow("M2", "HANDOVER", "system:mcm")).thenReturn(null); // 그사이 모델이 지워졌다

        service.handover(handover("u1", "u2"));

        InOrder order = inOrder(store, versions, hub, txManager);
        order.verify(store).reassign(eq(UserOwnershipKind.ERD_OWNER), any(), any(), any());
        order.verify(versions).versionNow("M1", "HANDOVER", "system:mcm");
        order.verify(hub).publishVersion(m1);
        order.verify(txManager).commit(txStatus);
        verify(hub, never()).publishVersion(null);
    }

    @Test
    void 한_종류라도_실패하면_롤백하고_예외를_그대로_올린다() {
        when(txManager.getTransaction(any())).thenReturn(txStatus);
        when(store.erdDraftModelsOf("u1")).thenReturn(List.of());
        RuntimeException boom = new RuntimeException("ORA-00001");
        when(store.reassign(eq(UserOwnershipKind.RULE_OWNER), any(), any(), any())).thenThrow(boom);

        assertSame(boom, assertThrows(RuntimeException.class, () -> service.handover(handover("u1", "u2"))));

        verify(txManager).rollback(txStatus);
        verify(txManager, never()).commit(any());
        verify(store, never()).reassign(eq(UserOwnershipKind.RULE_SET_OWNER), any(), any(), any());
        verify(hub, never()).releaseAllOf(any());
    }

    @Test
    void 사번_칸은_사번을_사용자_ID_칸은_사용자_ID_를_쓰고_사번이_없으면_null_이다() {
        assertEquals("1001", UserOwnershipService.pick(IdType.EMP_NO, "u1", "1001"));
        assertNull(UserOwnershipService.pick(IdType.EMP_NO, "u1", null));
        assertEquals("u1", UserOwnershipService.pick(IdType.USER_ID, "u1", null));
    }

    @Test
    void 지금_MDM_의_소유_칸은_모두_사용자_ID_다() {
        // 사번 칸이 생기면 이 시험을 고치고 handover 의 skipped 경로 시험을 더한다
        assertTrue(Arrays.stream(UserOwnershipKind.values()).allMatch(k -> k.idType() == IdType.USER_ID));
    }

    // ── releaseClaims ───────────────────────────────────────────────────────

    @Test
    void 작업_중_표시_지우기는_사용자_ID_가_필수이고_지운_건수를_돌려준다() {
        assertThrows(UserOwnershipService.InvalidRequest.class, () -> service.releaseClaims(" "));
        verifyNoInteractions(hub);

        when(txManager.getTransaction(any())).thenReturn(txStatus);
        when(hub.releaseAllOf("u1")).thenReturn(3);

        assertEquals(3, service.releaseClaims(" u1 "));
        verify(txManager).commit(txStatus);
        verifyNoInteractions(store);
    }
}
