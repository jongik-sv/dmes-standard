package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.ApplyFromOrderCheck;
import com.dongkuk.dmes.mdm.contract.version.DraftWriter;
import com.dongkuk.dmes.mdm.contract.version.NewVersionCommand;
import com.dongkuk.dmes.mdm.contract.version.ParentPromotion;
import com.dongkuk.dmes.mdm.contract.version.SourcePicker;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionSnapshot;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InOrder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;

/**
 * 새 버전 훅(BE 리팩토링 2회차 C3) — 순서(트랜잭션 시작 → 가드 → 원천 → 번호 → 쓰기 → 승격 → 커밋), 번호 기준(상태 무관 최대값), 승격
 * 조건(적용된 RELEASED 가 하나라도), 실패하면 롤백하고 커밋하지 않음을 고정한다. 저장소·트랜잭션 관리자는 가짜다. 시계는
 * 2026-06-15 09:00:00.5 이고 훅은 초 아래를 잘라 비교한다.
 */
class DefaultVersionStateServiceNewVersionTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);
    private static final String ID = "R1";

    private final VersionRowStore store = mock(VersionRowStore.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final TransactionStatus txStatus = mock(TransactionStatus.class);
    private final DefaultVersionStateService service = new DefaultVersionStateService(txManager, store,
            mock(MdmCurrentUser.class), mock(ApplyFromOrderCheck.class), mock(VersionSpiRegistry.class), mock(MdmNativeAuditSupport.class),
            Clock.fixed(NOW.plusNanos(500_000_000).atZone(KST).toInstant(), KST), mock(MetaRevisionRecorder.class));
    private final SourcePicker picker = mock(SourcePicker.class);
    private final DraftWriter writer = mock(DraftWriter.class);
    private final ParentPromotion promotion = mock(ParentPromotion.class);

    private static VersionRow row(String ver, String status, LocalDateTime applyFrom) {
        return new VersionRow(new VersionRef(VersionTarget.BUSINESS_RULE, ID, new BigDecimal(ver)), status, null, applyFrom, null, 0L);
    }

    private static NewVersionCommand command(VersionKind kind) {
        return new NewVersionCommand(VersionTarget.BUSINESS_RULE, ID, kind, "kim");
    }

    private void given(VersionRow... rows) {
        when(txManager.getTransaction(any())).thenReturn(txStatus);
        when(store.findAll(VersionTarget.BUSINESS_RULE, ID)).thenReturn(List.of(rows));
    }

    private VersionRef newVersion(VersionKind kind) {
        return service.newVersion(command(kind), picker, writer, promotion);
    }

    private BusinessException rejected(VersionKind kind) {
        return assertThrows(BusinessException.class, () -> newVersion(kind));
    }

    /** 실패하면 그 트랜잭션을 롤백하고 커밋하지 않는다(하나라도 실패하면 전부 되돌아간다). */
    private void verifyRolledBack() {
        verify(txManager).rollback(txStatus);
        verify(txManager, never()).commit(any());
    }

    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    @Test
    void 원천_번호_쓰기_승격_순서로_하고_번호는_상태와_무관한_최대값에서_올린다() {
        given(row("1.000", "RELEASED", NOW.minusDays(1)), row("2.000", "CANCELLED", NOW.minusDays(1)));
        when(picker.pick(any())).thenReturn(Optional.of(new BigDecimal("1.000")));

        VersionRef draft = newVersion(VersionKind.MAJOR);

        VersionRef expected = new VersionRef(VersionTarget.BUSINESS_RULE, ID, new BigDecimal("3.000"));
        assertEquals(expected, draft);
        InOrder order = inOrder(txManager, store, picker, writer, promotion);
        // 전파 REQUIRED — 호출자 트랜잭션이 있으면 합류하고 따로 커밋하지 않는다
        order.verify(txManager).getTransaction(argThat(d -> d.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRED));
        order.verify(store).findAll(VersionTarget.BUSINESS_RULE, ID);
        order.verify(picker).pick(List.of(new VersionSnapshot(new BigDecimal("1.000"), "RELEASED", NOW.minusDays(1)),
                new VersionSnapshot(new BigDecimal("2.000"), "CANCELLED", NOW.minusDays(1))));
        order.verify(writer).write(expected, VersionKind.MAJOR, "kim", Optional.of(new BigDecimal("1.000")));
        order.verify(promotion).promote(VersionTarget.BUSINESS_RULE, ID);
        order.verify(txManager).commit(txStatus);
        verify(txManager, never()).rollback(any());
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"DRAFT", "REQUESTED", "APPROVED", "FUTURE_RELEASED"})
    void 미적용_버전이_있으면_MDM006_이고_원천을_고르지_않는다(String kind) {
        VersionRow unapplied = kind.equals("FUTURE_RELEASED") ? row("2.000", "RELEASED", NOW.plusSeconds(1)) : row("2.000", kind, null);
        given(row("1.000", "RELEASED", NOW.minusDays(1)), unapplied);

        BusinessException e = rejected(VersionKind.MAJOR);

        assertEquals("MDM006", code(e));
        verifyNoInteractions(picker, writer, promotion);
        verifyRolledBack();
    }

    @Test
    void 원천_오류는_그대로_나가고_아무것도_쓰지_않는다() {
        given(row("1.000", "CANCELLED", NOW.minusDays(1)));
        BusinessException rejected = new BusinessException(ErrorCode.BUSINESS_ERROR, "원천 없음");
        when(picker.pick(any())).thenThrow(rejected);

        assertSame(rejected, rejected(VersionKind.MAJOR));
        verifyNoInteractions(writer, promotion);
        verifyRolledBack();
    }

    @Test
    void 버전이_없으면_MINOR_는_MDM021_이고_MAJOR_는_승격_없이_1_000_이다() {
        given();
        when(picker.pick(any())).thenReturn(Optional.empty());

        BusinessException e = rejected(VersionKind.MINOR);
        assertEquals("MDM021", code(e));
        verifyNoInteractions(writer);
        verifyRolledBack();

        VersionRef draft = newVersion(VersionKind.MAJOR);
        assertEquals(new BigDecimal("1.000"), draft.ver());
        verify(writer).write(draft, VersionKind.MAJOR, "kim", Optional.empty());
        verifyNoInteractions(promotion);
    }

    @Test
    void minor_상한이면_MDM009_이고_쓰지_않는다() {
        given(row("1.999", "RELEASED", NOW.minusDays(1)));
        when(picker.pick(any())).thenReturn(Optional.of(new BigDecimal("1.999")));

        BusinessException e = rejected(VersionKind.MINOR);

        assertEquals("MDM009", code(e));
        verifyNoInteractions(writer, promotion);
        verifyRolledBack();
    }

    /** 쓰기가 실패하면 예외가 그대로 나가고 승격하지 않으며 롤백한다(커밋하지 않는다). */
    @Test
    void 쓰기가_실패하면_승격하지_않고_롤백한다() {
        given(row("1.000", "RELEASED", NOW.minusDays(1)));
        when(picker.pick(any())).thenReturn(Optional.of(new BigDecimal("1.000")));
        IllegalStateException failure = new IllegalStateException("쓰기 실패");
        doThrow(failure).when(writer).write(any(), any(), any(), any());

        assertSame(failure, assertThrows(IllegalStateException.class, () -> newVersion(VersionKind.MAJOR)));
        verifyNoInteractions(promotion);
        verifyRolledBack();
    }

    /** 승격이 실패하면 예외가 그대로 나가고 롤백한다(커밋하지 않는다). */
    @Test
    void 승격이_실패하면_롤백한다() {
        given(row("1.000", "RELEASED", NOW.minusDays(1)));
        when(picker.pick(any())).thenReturn(Optional.of(new BigDecimal("1.000")));
        IllegalStateException failure = new IllegalStateException("승격 실패");
        doThrow(failure).when(promotion).promote(VersionTarget.BUSINESS_RULE, ID);

        assertSame(failure, assertThrows(IllegalStateException.class, () -> newVersion(VersionKind.MAJOR)));
        verify(writer).write(any(), any(), any(), any());
        verifyRolledBack();
    }

    /** 경계 — 적용 시작이 지금(초 단위)과 같으면 적용됨이라 미적용 가드를 지나고 승격한다. */
    @Test
    void 적용_시작이_지금과_같은_RELEASED_는_적용됨이라_승격한다() {
        given(row("1.000", "RELEASED", NOW));
        when(picker.pick(any())).thenReturn(Optional.of(new BigDecimal("1.000")));

        newVersion(VersionKind.MINOR);

        verify(promotion).promote(VersionTarget.BUSINESS_RULE, ID);
    }

    @Test
    void 적용된_RELEASED_가_없으면_승격하지_않는다() {
        given(row("1.000", "CANCELLED", NOW.minusDays(1)));
        when(picker.pick(any())).thenReturn(Optional.empty());

        VersionRef draft = newVersion(VersionKind.MAJOR);

        assertEquals(new BigDecimal("2.000"), draft.ver());
        verify(writer).write(draft, VersionKind.MAJOR, "kim", Optional.empty());
        verify(promotion, never()).promote(any(), any());
    }
}
