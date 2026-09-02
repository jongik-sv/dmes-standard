package com.dongkuk.caravan.hub.inbound.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.hub.common.util.SftpSessionManager;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.SftpException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * FILE INBOUND 핸들러 단위 테스트.
 *
 * <p>TRANSACTION_CODE 추출 규칙 + H-14 파일 후처리(부분실패 격리/알림) 결정 로직을 검증한다.
 * SFTP 세션/폴링 자체(ls/get/session)는 통합 검증 대상이라 제외하고, 후처리 결정은
 * {@code finalizeFile} 에 mock {@link ChannelSftp} 로 rename 타깃·알림을 검증한다.</p>
 */
@ExtendWith(MockitoExtension.class)
class FileInboundHandlerTest {

    @Mock private KafkaMessageProducer kafkaMessageProducer;
    @Mock private SftpSessionManager sftpSessionManager;
    @Mock private AlertNotifier alertNotifier;
    @Mock private CaravanProperties caravanProperties;
    @Mock private ChannelSftp channelSftp;

    @InjectMocks private FileInboundHandler handler;

    // ── TRANSACTION_CODE 추출 ──

    @Test
    @DisplayName("파이프 포함 시 첫 세그먼트를 TRANSACTION_CODE 로 추출")
    void extractsFirstSegment() {
        assertThat(FileInboundHandler.extractTransactionCode("PQR02012|P|S|5A|20260130"))
                .isEqualTo("PQR02012");
    }

    @Test
    @DisplayName("파이프 없으면 전체 문자열이 TRANSACTION_CODE")
    void wholeStringWhenNoPipe() {
        assertThat(FileInboundHandler.extractTransactionCode("PQR02012"))
                .isEqualTo("PQR02012");
    }

    @Test
    @DisplayName("null/빈 문자열이면 IllegalArgumentException")
    void nullOrEmptyThrows() {
        assertThatThrownBy(() -> FileInboundHandler.extractTransactionCode(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> FileInboundHandler.extractTransactionCode(""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("맨 앞이 파이프면 TRANSACTION_CODE 추출 불가 → IllegalArgumentException")
    void leadingPipeThrows() {
        assertThatThrownBy(() -> FileInboundHandler.extractTransactionCode("|P|S"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ── H-14 파일 후처리 ──

    @Test
    @DisplayName("전건 성공 → 백업 폴더 이동, 알림 없음")
    void allSuccess_movesToBackup_noAlert() throws Exception {
        handler.finalizeFile(channelSftp, "T", "/in/f.txt", "/bak", "f.txt", 5, 0);

        verify(channelSftp).rename("/in/f.txt", "/bak/f.txt");
        verify(alertNotifier, never()).send(any(AlertEvent.class));
    }

    @Test
    @DisplayName("부분 실패 → 에러 폴더 격리 + 운영자 알림(백업 아님)")
    void partialFailure_quarantinesToErrorFolder_andAlerts() throws Exception {
        handler.finalizeFile(channelSftp, "T", "/in/f.txt", "/bak", "f.txt", 3, 2);

        verify(channelSftp).rename("/in/f.txt", "/bak/error/f.txt");
        verify(channelSftp, never()).rename("/in/f.txt", "/bak/f.txt");
        verify(alertNotifier).send(any(AlertEvent.class));
    }

    @Test
    @DisplayName("전건 성공인데 백업 이동(rename) 실패 → 원본 잔존 → 중복 위험 알림")
    void backupMoveFailure_alertsStuck() throws Exception {
        doThrow(new SftpException(4, "rename fail"))
                .when(channelSftp).rename("/in/f.txt", "/bak/f.txt");

        handler.finalizeFile(channelSftp, "T", "/in/f.txt", "/bak", "f.txt", 5, 0);

        verify(alertNotifier).send(any(AlertEvent.class));
    }
}
