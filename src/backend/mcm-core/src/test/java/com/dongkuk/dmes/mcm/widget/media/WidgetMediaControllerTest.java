package com.dongkuk.dmes.mcm.widget.media;

import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.ascii;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dongkuk.dmes.mcm.widget.media.entity.WidgetMedia;
import com.dongkuk.dmes.mcm.widget.media.repository.WidgetMediaRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * {@link WidgetMediaController} — MockMvc standalone(보안 필터 없음). 저장소는 임시 폴더 + Mockito 메타 저장소.
 * 스펙 §5.1(내려받기: nosniff·inline·Range)·§5.2(올리기 JSON).
 */
@ExtendWith(MockitoExtension.class)
class WidgetMediaControllerTest {

    private static final String UPLOAD = "/api/mcm/commWidgetMng/upload";
    private static final String FILE = "/api/mcm/widgetMedia/file/{fileId}";
    private static final String FILE_ID = "0123456789abcdef0123456789abcdef";

    @TempDir Path tempDir;
    @Mock WidgetMediaRepository repository;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        WidgetMediaStorage storage = new WidgetMediaStorage(repository, tempDir.toString());
        mvc = MockMvcBuilders.standaloneSetup(new WidgetMediaController(storage)).build();
    }

    /** 0..99 바이트 png(앞 8바이트는 매직 넘버)를 디스크·메타에 둔다. */
    private byte[] storePng(String origNm) throws Exception {
        byte[] bytes = png(100);
        Files.write(tempDir.resolve(FILE_ID), bytes);
        WidgetMedia m = new WidgetMedia();
        m.setFileId(FILE_ID);
        m.setOrigNm(origNm);
        m.setContentType("image/png");
        m.setFileSize(100L);
        when(repository.findById(FILE_ID)).thenReturn(Optional.of(m));
        return bytes;
    }

    @Test
    @DisplayName("올리기 — multipart file 을 받아 {fileId, origNm, contentType, size} JSON 200")
    void uploadReturnsJson() throws Exception {
        when(repository.save(any(WidgetMedia.class))).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file = new MockMultipartFile("file", "배너.png", "image/png", png(256));

        mvc.perform(multipart(UPLOAD).file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileId").value(matchesPattern("^[0-9a-f]{32}$")))
                .andExpect(jsonPath("$.origNm").value("배너.png"))
                .andExpect(jsonPath("$.contentType").value("image/png"))
                .andExpect(jsonPath("$.size").value(256));
    }

    @Test
    @DisplayName("올리기 거절 — SVG 는 400 + REST 오류 응답 관례(meta.success=false·code·message)")
    void uploadRejectsSvgWithErrorEnvelope() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "x.png", "image/png", ascii("<svg/>"));

        mvc.perform(multipart(UPLOAD).file(file))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.meta.success").value(false))
                .andExpect(jsonPath("$.meta.code").value("E002"))
                .andExpect(jsonPath("$.meta.message").value(WidgetMediaStorage.MSG_BAD_FORMAT));
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("올리기 거절 — file 필드가 없으면 400")
    void uploadWithoutFileIs400() throws Exception {
        mvc.perform(multipart(UPLOAD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.meta.code").value("E001"))
                .andExpect(jsonPath("$.meta.message").value(WidgetMediaStorage.MSG_NO_FILE));
    }

    @Test
    @DisplayName("multipart 상한 초과(MaxUploadSizeExceededException) → 400 + E002 + 스펙 문구(전역 500 아님)")
    @SuppressWarnings("unchecked")
    void tooLargeMultipartIs400WithSpecMessage() {
        WidgetMediaController controller =
                new WidgetMediaController(new WidgetMediaStorage(repository, tempDir.toString()));

        ResponseEntity<Map<String, Object>> res =
                controller.handleTooLarge(new MaxUploadSizeExceededException(100L * 1024 * 1024));

        assertThat(res.getStatusCode().value()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(res.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        Map<String, Object> meta = (Map<String, Object>) res.getBody().get("meta");
        assertThat(meta)
                .containsEntry("success", false)
                .containsEntry("code", "E002")
                .containsEntry("message", WidgetMediaStorage.MSG_TOO_LARGE)
                .containsKey("txId");
        assertThat(WidgetMediaStorage.MSG_TOO_LARGE).isEqualTo("이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다");
    }

    @Test
    @DisplayName("내려받기 — 저장 형식·nosniff·inline(UTF-8 이름)·private 캐시 1일, 본문 전부")
    void downloadHeaders() throws Exception {
        byte[] bytes = storePng("사진 1.png");

        MvcResult r = mvc.perform(get(FILE, FILE_ID))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Disposition", startsWith("inline")))
                .andExpect(header().string("Content-Disposition", containsString("filename*=UTF-8''")))
                .andExpect(header().string("Content-Disposition",
                        containsString("%EC%82%AC%EC%A7%84%201.png")))
                .andExpect(header().string("Cache-Control", "private, max-age=86400"))
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(content().bytes(bytes))
                .andReturn();
        assertThat(r.getResponse().getContentLength()).isEqualTo(100);
    }

    @Test
    @DisplayName("내려받기 Range: bytes=0-9 → 206 · Content-Range · 앞 10바이트")
    void downloadRange() throws Exception {
        byte[] bytes = storePng("a.png");

        mvc.perform(get(FILE, FILE_ID).header("Range", "bytes=0-9"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-9/100"))
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(Arrays.copyOfRange(bytes, 0, 10)));
    }

    @Test
    @DisplayName("내려받기 Range 가운데 구간 bytes=50-59 → 206")
    void downloadMiddleRange() throws Exception {
        byte[] bytes = storePng("a.png");

        mvc.perform(get(FILE, FILE_ID).header("Range", "bytes=50-59"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 50-59/100"))
                .andExpect(content().bytes(Arrays.copyOfRange(bytes, 50, 60)));
    }

    @Test
    @DisplayName("없는 파일은 404(메타 없음)")
    void missingFileIs404() throws Exception {
        when(repository.findById(FILE_ID)).thenReturn(Optional.empty());

        mvc.perform(get(FILE, FILE_ID)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("메타는 있는데 디스크 파일이 없으면 404")
    void missingDiskFileIs404() throws Exception {
        storePng("a.png");
        Files.delete(tempDir.resolve(FILE_ID));

        mvc.perform(get(FILE, FILE_ID)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("형식이 틀린 fileId(대문자·짧음·점 두 개)는 404, 저장소를 보지 않는다")
    void malformedIdIs404() throws Exception {
        mvc.perform(get(FILE, "0123456789ABCDEF0123456789ABCDEF")).andExpect(status().isNotFound());
        mvc.perform(get(FILE, "abc")).andExpect(status().isNotFound());
        mvc.perform(get(FILE, "..")).andExpect(status().isNotFound());
        verify(repository, never()).findById(any());
    }
}
