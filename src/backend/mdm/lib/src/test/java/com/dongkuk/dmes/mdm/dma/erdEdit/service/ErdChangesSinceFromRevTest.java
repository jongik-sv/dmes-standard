package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;

/**
 * 변경 기록 fromRev(defect.historyEmptyBeforeSpan) — 요청 구간을 줄 수 없어 reload 일 때 기록을 줄 수 있는 가장 이른 sinceRev 를 싣는다.
 * 기록 저장소·rev 는 시험 대역이다(SQL 은 Oracle 시험 몫).
 */
class ErdChangesSinceFromRevTest {

    private static final String MODEL = "mcm";

    private ErdModelStore store;
    private ErdCommandLogStore log;
    private PlatformTransactionManager ptm;
    private ErdCommandService service;

    @BeforeEach
    void setUp() {
        store = mock(ErdModelStore.class);
        log = mock(ErdCommandLogStore.class);
        ptm = mock(PlatformTransactionManager.class);
        service = new ErdCommandService(store, mock(ErdDiagramStore.class), log, mock(ErdDictionaryLoader.class),
                mock(VersionWriteGuard.class), mock(ErdEventHub.class), mock(ErdCoEditors.class),
                ptm, mock(EntityManager.class), new ErdChangeFeed(store, log, ptm));
    }

    @Test
    void deltasAvailableHaveNoFromRev() {
        when(store.rev(MODEL)).thenReturn(40L);
        ErdDelta d = new ErdDelta(MODEL, 40, "admin", "ui-a", "UI", List.of());
        when(log.since(MODEL, 38, 40)).thenReturn(Optional.of(List.of(d)));

        ErdChangesView v = service.changesSince(MODEL, 38);

        assertThat(v.reload()).isFalse();
        assertThat(v.deltas()).containsExactly(d);
        assertThat(v.fromRev()).isNull();
        verify(log, never()).lastMarker(anyString(), anyLong(), anyLong());
    }

    /** U22: 기록 저장소가 at 을 준 델타는 변경 기록 응답에 그 시각 그대로 실린다. */
    @Test
    void deltaAtPassesThroughToView() {
        when(store.rev(MODEL)).thenReturn(40L);
        ErdDelta d = new ErdDelta(MODEL, 40, "admin", "ui-a", "UI", null, List.of(), "2026-10-11T14:03:00");
        when(log.since(MODEL, 38, 40)).thenReturn(Optional.of(List.of(d)));

        ErdChangesView v = service.changesSince(MODEL, 38);

        assertThat(v.deltas()).hasSize(1);
        assertThat(v.deltas().get(0).at()).isEqualTo("2026-10-11T14:03:00");
    }

    @Test
    void markerInsideSpanGivesMarkerRev() {
        // copy 로 만든 DRAFT: 표시 행 rev 38, 지금 rev 40. sinceRev 0 은 표시 행을 넘으므로 reload, fromRev=38.
        when(store.rev(MODEL)).thenReturn(40L);
        when(log.since(MODEL, 0, 40)).thenReturn(Optional.empty());
        when(log.lastMarker(MODEL, 0, 40)).thenReturn(Optional.of(38L));

        ErdChangesView v = service.changesSince(MODEL, 0);

        assertThat(v.reload()).isTrue();
        assertThat(v.deltas()).isEmpty();
        assertThat(v.rev()).isEqualTo(40);
        assertThat(v.fromRev()).isEqualTo(38L);
    }

    @Test
    void overMaxReplayGivesLowerBound() {
        // 표시 행 없이 500건을 넘게 밀렸다 — 하한 rev-500.
        when(store.rev(MODEL)).thenReturn(942L);
        when(log.since(MODEL, 100, 942)).thenReturn(Optional.empty());
        when(log.lastMarker(MODEL, 442, 942)).thenReturn(Optional.empty());

        ErdChangesView v = service.changesSince(MODEL, 100);

        assertThat(v.reload()).isTrue();
        assertThat(v.fromRev()).isEqualTo(442L);
    }

    @Test
    void overMaxReplayWithMarkerInsideBoundGivesMarker() {
        when(store.rev(MODEL)).thenReturn(942L);
        when(log.since(MODEL, 0, 942)).thenReturn(Optional.empty());
        when(log.lastMarker(MODEL, 442, 942)).thenReturn(Optional.of(900L));

        assertThat(service.changesSince(MODEL, 0).fromRev()).isEqualTo(900L);
    }

    @Test
    void sinceRevAboveRevHasNoFromRev() {
        when(store.rev(MODEL)).thenReturn(40L);

        ErdChangesView v = service.changesSince(MODEL, 41);

        assertThat(v.reload()).isTrue();
        assertThat(v.fromRev()).isNull();
        verify(log, never()).since(anyString(), anyLong(), anyLong());
    }

    /**
     * 변경 읽기는 읽기 전용·REQUIRED 트랜잭션 하나에서 rev → 기록 순서로 읽고 커밋한다. REQUIRED 라 OASIS 바깥 트랜잭션이 있으면 합류해
     * view·sinceRev 가 연결 하나만 쓴다.
     */
    @Test
    void changesSinceRunsInOneReadOnlyRequiredTransaction() {
        TransactionStatus status = mock(TransactionStatus.class);
        when(ptm.getTransaction(any())).thenReturn(status);
        when(store.rev(MODEL)).thenReturn(40L);
        when(log.since(MODEL, 38, 40)).thenReturn(Optional.of(List.of()));

        service.changesSince(MODEL, 38);

        ArgumentCaptor<TransactionDefinition> def = ArgumentCaptor.forClass(TransactionDefinition.class);
        verify(ptm).getTransaction(def.capture());
        assertThat(def.getValue().isReadOnly()).isTrue();
        assertThat(def.getValue().getPropagationBehavior()).isEqualTo(TransactionDefinition.PROPAGATION_REQUIRED);
        InOrder order = inOrder(ptm, store, log);
        order.verify(ptm).getTransaction(any());
        order.verify(store).rev(MODEL);
        order.verify(log).since(MODEL, 38, 40);
        order.verify(ptm).commit(status);
        verifyNoMoreInteractions(ptm);
    }

    /**
     * 모델이 없으면 store.rev 의 ERD_MODEL_NOT_FOUND(MDM029)를 감싸지 않고 그대로 던지고 트랜잭션은 되돌린다 — 허브 재생 읽기가 이 코드로
     * reload 를 고른다.
     */
    @Test
    void missingModelRethrowsModelNotFoundUnwrapped() {
        TransactionStatus status = mock(TransactionStatus.class);
        when(ptm.getTransaction(any())).thenReturn(status);
        BusinessException notFound = MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        when(store.rev(MODEL)).thenThrow(notFound);

        Throwable thrown = catchThrowable(() -> service.changesSince(MODEL, 38));

        assertThat(thrown).isSameAs(notFound).isInstanceOf(ResponseCodeAware.class);
        assertThat(((ResponseCodeAware) thrown).responseCode()).isEqualTo("MDM029");
        verify(log, never()).since(anyString(), anyLong(), anyLong());
        verify(log, never()).lastMarker(anyString(), anyLong(), anyLong());
        verify(ptm).rollback(status);
        verify(ptm, never()).commit(any());
    }
}
