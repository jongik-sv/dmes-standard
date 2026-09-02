package com.dongkuk.caravan.hub.outbound.file;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.common.util.SftpSessionManager;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * TC-OFILE-001 ~ TC-OFILE-010: OUTBOUND FILE 핸들러 테스트
 */
@ExtendWith(MockitoExtension.class)
class FileOutboundHandlerTest {

    @Mock
    private SftpSessionManager sftpSessionManager;
    @Mock
    private Session session;
    @Mock
    private ChannelSftp channelSftp;

    @InjectMocks
    private FileOutboundHandler fileOutboundHandler;

    private Map<String, Object> createConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("FILE_PATH", "/data/outbound");
        config.put("FTP_HOST", "10.10.90.156");
        config.put("FTP_PORT", 22);
        config.put("FTP_USER", "sftpuser");
        config.put("FTP_PASSWORD", "password");
        return config;
    }

    private KafkaMessageContext createContext() {
        KafkaMessageContext context = mock(KafkaMessageContext.class);
        when(context.getInterfaceId()).thenReturn("MMPPMMCMTT01");
        when(context.getKafkaKeyData()).thenReturn("840d4999-1234-5678-abcd-ef0123456789");
        when(context.getInterfaceMsg()).thenReturn("PQR02012|P|S|5A|20260130");
        return context;
    }

    // ========== TC-OFILE-001: 정상 SFTP 파일 생성 ==========

    @Nested
    @DisplayName("TC-OFILE-001: 정상 SFTP 파일 생성")
    class NormalFileCreation {

        @Test
        @DisplayName("Kafka 메시지를 SFTP 서버에 파일로 업로드")
        void shouldUploadFileToSftp() throws Exception {
            // given
            KafkaMessageContext context = createContext();
            Map<String, Object> config = createConfig();

            when(sftpSessionManager.getOrCreateSession(anyString(), anyInt(), anyString(), anyString()))
                    .thenReturn(session);
            when(session.openChannel("sftp")).thenReturn(channelSftp);
            when(channelSftp.isConnected()).thenReturn(true);

            // when
            fileOutboundHandler.handle(context, config);

            // then
            verify(channelSftp).put(any(InputStream.class), argThat(path -> {
                assertThat(path).startsWith("/data/outbound/MMPPMMCMTT01_");
                assertThat(path).endsWith("_840d4999.txt");
                return true;
            }));
            verify(channelSftp).disconnect();
        }
    }

    // ========== TC-OFILE-002: 파일명 생성 규칙 ==========

    @Nested
    @DisplayName("TC-OFILE-002: 파일명 생성 규칙")
    class FileNameGeneration {

        @Test
        @DisplayName("KAFKA_KEYDATA에서 UUID 앞 8자리 추출")
        void shouldExtractFirst8CharsFromUuid() throws Exception {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_01");
            when(context.getKafkaKeyData()).thenReturn("ABCDEFGH-1234-5678-abcd-ef0123456789");
            when(context.getInterfaceMsg()).thenReturn("MSG|DATA");

            Map<String, Object> config = createConfig();
            when(sftpSessionManager.getOrCreateSession(anyString(), anyInt(), anyString(), anyString()))
                    .thenReturn(session);
            when(session.openChannel("sftp")).thenReturn(channelSftp);

            // when
            fileOutboundHandler.handle(context, config);

            // then
            verify(channelSftp).put(any(InputStream.class), argThat(path -> {
                assertThat(path).contains("ABCDEFGH");
                return true;
            }));
        }

        @Test
        @DisplayName("KAFKA_KEYDATA가 null이면 대체값 사용")
        void shouldUseFallbackWhenKafkaKeyDataIsNull() throws Exception {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_01");
            when(context.getKafkaKeyData()).thenReturn(null);
            when(context.getInterfaceMsg()).thenReturn("MSG|DATA");

            Map<String, Object> config = createConfig();
            when(sftpSessionManager.getOrCreateSession(anyString(), anyInt(), anyString(), anyString()))
                    .thenReturn(session);
            when(session.openChannel("sftp")).thenReturn(channelSftp);

            // when
            fileOutboundHandler.handle(context, config);

            // then
            verify(channelSftp).put(any(InputStream.class), argThat(path -> {
                assertThat(path).startsWith("/data/outbound/TOPIC_01_");
                assertThat(path).endsWith(".txt");
                return true;
            }));
        }

        @Test
        @DisplayName("KAFKA_KEYDATA가 8자 미만이면 대체값 사용")
        void shouldUseFallbackWhenKafkaKeyDataTooShort() throws Exception {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_01");
            when(context.getKafkaKeyData()).thenReturn("SHORT");
            when(context.getInterfaceMsg()).thenReturn("MSG|DATA");

            Map<String, Object> config = createConfig();
            when(sftpSessionManager.getOrCreateSession(anyString(), anyInt(), anyString(), anyString()))
                    .thenReturn(session);
            when(session.openChannel("sftp")).thenReturn(channelSftp);

            // when
            fileOutboundHandler.handle(context, config);

            // then
            verify(channelSftp).put(any(InputStream.class), anyString());
        }
    }

    // ========== TC-OFILE-003/004: 필수 설정 미존재 ==========

    @Nested
    @DisplayName("TC-OFILE-003/004/005: 필수 설정 미존재")
    class MissingConfig {

        @Test
        @DisplayName("FILE_PATH가 null이면 IllegalStateException")
        void shouldThrowWhenFilePathIsNull() {
            // given
            KafkaMessageContext context = createContext();
            Map<String, Object> config = createConfig();
            config.put("FILE_PATH", null);

            // when & then
            assertThatThrownBy(() -> fileOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("FILE_PATH");
        }

        @Test
        @DisplayName("FTP_HOST가 null이면 IllegalStateException")
        void shouldThrowWhenFtpHostIsNull() {
            // given
            KafkaMessageContext context = createContext();
            Map<String, Object> config = createConfig();
            config.put("FTP_HOST", null);

            // when & then
            assertThatThrownBy(() -> fileOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("FTP_HOST");
        }

        @Test
        @DisplayName("INTERFACE_MSG가 null이면 IllegalStateException")
        void shouldThrowWhenInterfaceMsgIsNull() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_01");
            when(context.getKafkaKeyData()).thenReturn("uuid-1234");
            when(context.getInterfaceMsg()).thenReturn(null);

            Map<String, Object> config = createConfig();

            // when & then
            assertThatThrownBy(() -> fileOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("INTERFACE_MSG");
        }
    }

    // ========== TC-OFILE-006: SFTP 연결 실패 ==========

    @Nested
    @DisplayName("TC-OFILE-006: SFTP 연결 실패")
    class SftpConnectionFailure {

        @Test
        @DisplayName("세션 획득 실패 시 IllegalStateException")
        void shouldThrowWhenSessionAcquisitionFails() {
            // given
            KafkaMessageContext context = createContext();
            Map<String, Object> config = createConfig();
            when(sftpSessionManager.getOrCreateSession(anyString(), anyInt(), anyString(), anyString()))
                    .thenReturn(null);

            // when & then
            assertThatThrownBy(() -> fileOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("SFTP 세션 획득 실패");
        }
    }

    // ========== TC-OFILE-007: SFTP 채널 오류 시 세션 캐시 제거 ==========

    @Nested
    @DisplayName("TC-OFILE-007: SFTP 채널 오류 시 세션 캐시 제거")
    class SftpChannelError {

        @Test
        @DisplayName("JSchException 발생 시 세션 캐시에서 제거")
        void shouldRemoveSessionOnJSchException() throws Exception {
            // given
            KafkaMessageContext context = createContext();
            Map<String, Object> config = createConfig();
            when(sftpSessionManager.getOrCreateSession(anyString(), anyInt(), anyString(), anyString()))
                    .thenReturn(session);
            when(session.openChannel("sftp")).thenThrow(new JSchException("Channel error"));

            // when & then
            assertThatThrownBy(() -> fileOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class);

            verify(sftpSessionManager).removeSession("10.10.90.156", 22, "sftpuser");
        }
    }

    // ========== TC-OFILE-010: FTP_PORT 기본값 ==========

    @Nested
    @DisplayName("TC-OFILE-010: FTP_PORT 기본값")
    class DefaultFtpPort {

        @Test
        @DisplayName("FTP_PORT가 null이면 기본값 22 사용")
        void shouldUseDefaultPort22WhenPortIsNull() throws Exception {
            // given
            KafkaMessageContext context = createContext();
            Map<String, Object> config = createConfig();
            config.put("FTP_PORT", null);
            when(sftpSessionManager.getOrCreateSession(anyString(), eq(22), anyString(), anyString()))
                    .thenReturn(session);
            when(session.openChannel("sftp")).thenReturn(channelSftp);

            // when
            fileOutboundHandler.handle(context, config);

            // then
            verify(sftpSessionManager).getOrCreateSession("10.10.90.156", 22, "sftpuser", "password");
        }
    }
}
