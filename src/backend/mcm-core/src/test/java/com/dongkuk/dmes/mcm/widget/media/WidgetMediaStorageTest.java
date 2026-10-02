package com.dongkuk.dmes.mcm.widget.media;

import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.GIF_MAGIC;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.JPEG_MAGIC;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.MP4_MAGIC;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.PNG_MAGIC;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.WEBM_MAGIC;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.WEBP_MAGIC;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.ascii;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.file;
import static com.dongkuk.dmes.mcm.widget.media.MediaTestFiles.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.media.entity.WidgetMedia;
import com.dongkuk.dmes.mcm.widget.media.repository.WidgetMediaRepository;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;

/**
 * {@link WidgetMediaStorage} — 스펙 §4.3: 형식(확장자 + 매직 넘버)·크기·경로 조작 검사, 디스크 저장·열기.
 * 저장소는 Mockito, 파일은 JUnit 임시 폴더.
 */
@ExtendWith(MockitoExtension.class)
class WidgetMediaStorageTest {

    @TempDir Path tempDir;
    @Mock WidgetMediaRepository repository;

    WidgetMediaStorage storage;

    @BeforeEach
    void setUp() {
        storage = new WidgetMediaStorage(repository, tempDir.toString());
    }

    private static MockMultipartFile upload(String name, byte[] bytes) {
        return new MockMultipartFile("file", name, "application/octet-stream", bytes);
    }

    private void saveReturnsArgument() {
        when(repository.save(any(WidgetMedia.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private long filesInTempDir() throws IOException {
        try (Stream<Path> s = Files.list(tempDir)) {
            return s.count();
        }
    }

    private void assertRejected(MockMultipartFile f, String message) throws IOException {
        assertThatThrownBy(() -> storage.save(f))
                .isInstanceOf(BusinessException.class)
                .hasMessage(message)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isNotNull();
        verify(repository, never()).save(any());
        assertThat(filesInTempDir()).isZero();
    }

    @Test
    @DisplayName("png 를 저장하면 32자 fileId 로 디스크에 쓰고 메타(원래 이름·매직 넘버 형식·크기)를 저장한다, 열면 같은 바이트")
    void savesPngAndOpensIt() throws IOException {
        saveReturnsArgument();
        byte[] bytes = png(300);

        WidgetMedia saved = storage.save(upload("사진 1.png", bytes));

        assertThat(saved.getFileId()).matches("^[0-9a-f]{32}$");
        assertThat(saved.getOrigNm()).isEqualTo("사진 1.png");
        assertThat(saved.getContentType()).isEqualTo("image/png");
        assertThat(saved.getFileSize()).isEqualTo(300L);
        assertThat(Files.readAllBytes(tempDir.resolve(saved.getFileId()))).isEqualTo(bytes);
        verify(repository).save(saved);

        when(repository.findById(saved.getFileId())).thenReturn(Optional.of(saved));
        assertThat(storage.meta(saved.getFileId())).isSameAs(saved);
        Resource opened = storage.open(saved.getFileId());
        try (InputStream in = opened.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(bytes);
        }
        assertThat(opened.contentLength()).isEqualTo(300L);
    }

    @Test
    @DisplayName("저장 폴더가 없으면 만든다")
    void createsMissingMediaDir() {
        saveReturnsArgument();
        Path nested = tempDir.resolve("nested").resolve("widget-media");
        WidgetMediaStorage s = new WidgetMediaStorage(repository, nested.toString());

        WidgetMedia saved = s.save(upload("a.png", png(64)));

        assertThat(Files.isRegularFile(nested.resolve(saved.getFileId()))).isTrue();
    }

    @Test
    @DisplayName("저장 형식은 매직 넘버로 정한다 — jpg·jpeg·gif·webp·mp4·webm")
    void detectsEachAllowedFormat() {
        saveReturnsArgument();
        assertThat(storage.save(upload("a.JPG", file(JPEG_MAGIC, 50))).getContentType()).isEqualTo("image/jpeg");
        assertThat(storage.save(upload("a.jpeg", file(JPEG_MAGIC, 50))).getContentType()).isEqualTo("image/jpeg");
        assertThat(storage.save(upload("a.gif", file(GIF_MAGIC, 50))).getContentType()).isEqualTo("image/gif");
        assertThat(storage.save(upload("a.webp", file(WEBP_MAGIC, 50))).getContentType()).isEqualTo("image/webp");
        assertThat(storage.save(upload("a.mp4", file(MP4_MAGIC, 50))).getContentType()).isEqualTo("video/mp4");
        assertThat(storage.save(upload("a.webm", file(WEBM_MAGIC, 50))).getContentType()).isEqualTo("video/webm");
    }

    @Test
    @DisplayName("확장자와 내용이 같은 종류(이미지끼리)면 받고 형식은 내용 기준 — 이름만 .jpg 인 png")
    void sameKindDifferentImageFormatUsesMagic() {
        saveReturnsArgument();
        WidgetMedia saved = storage.save(upload("photo.jpg", png(80)));
        assertThat(saved.getContentType()).isEqualTo("image/png");
    }

    @Test
    @DisplayName("확장자 png + 내용 SVG 는 거절한다")
    void rejectsSvgDisguisedAsPng() throws IOException {
        byte[] svg = ascii("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
        assertRejected(upload("logo.png", svg), WidgetMediaStorage.MSG_BAD_FORMAT);
    }

    @Test
    @DisplayName("확장자 png + 내용 HTML 은 거절한다")
    void rejectsHtmlDisguisedAsPng() throws IOException {
        byte[] html = ascii("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
        assertRejected(upload("page.png", html), WidgetMediaStorage.MSG_BAD_FORMAT);
    }

    @Test
    @DisplayName("svg·html·이름 없는 확장자는 내용이 png 여도 거절한다")
    void rejectsDisallowedExtensions() throws IOException {
        assertRejected(upload("logo.svg", png(64)), WidgetMediaStorage.MSG_BAD_FORMAT);
        assertRejected(upload("page.html", png(64)), WidgetMediaStorage.MSG_BAD_FORMAT);
        assertRejected(upload("noext", png(64)), WidgetMediaStorage.MSG_BAD_FORMAT);
        assertRejected(upload("a.png.exe", png(64)), WidgetMediaStorage.MSG_BAD_FORMAT);
    }

    @Test
    @DisplayName("확장자는 동영상인데 내용은 이미지(또는 그 반대)면 거절한다")
    void rejectsKindMismatch() throws IOException {
        assertRejected(upload("clip.mp4", png(64)), WidgetMediaStorage.MSG_BAD_FORMAT);
        assertRejected(upload("pic.png", file(MP4_MAGIC, 64)), WidgetMediaStorage.MSG_BAD_FORMAT);
    }

    @Test
    @DisplayName("매직 넘버보다 짧은 파일은 거절한다")
    void rejectsTruncatedHeader() throws IOException {
        assertRejected(upload("a.png", new byte[] {(byte) 0x89, 0x50}), WidgetMediaStorage.MSG_BAD_FORMAT);
    }

    @Test
    @DisplayName("이미지 10MB 초과는 거절한다(10MB 정확히는 받는다)")
    void rejectsOversizedImage() throws IOException {
        assertRejected(upload("big.png", png((int) MediaFormat.IMAGE_MAX_BYTES + 1)), WidgetMediaStorage.MSG_TOO_LARGE);

        saveReturnsArgument();
        WidgetMedia ok = storage.save(upload("edge.png", png((int) MediaFormat.IMAGE_MAX_BYTES)));
        assertThat(ok.getFileSize()).isEqualTo(MediaFormat.IMAGE_MAX_BYTES);
    }

    @Test
    @DisplayName("동영상은 10MB 를 넘어도 100MB 까지 받는다")
    void videoAllowsMoreThanImageLimit() {
        saveReturnsArgument();
        WidgetMedia saved = storage.save(upload("clip.mp4", file(MP4_MAGIC, (int) MediaFormat.IMAGE_MAX_BYTES + 1)));
        assertThat(saved.getContentType()).isEqualTo("video/mp4");
        assertThat(MediaFormat.MP4.maxBytes()).isEqualTo(100L * 1024 * 1024);
        assertThat(MediaFormat.PNG.maxBytes()).isEqualTo(10L * 1024 * 1024);
    }

    @Test
    @DisplayName("파일이 없거나 비면 거절한다")
    void rejectsMissingOrEmptyFile() throws IOException {
        assertThatThrownBy(() -> storage.save(null))
                .isInstanceOf(BusinessException.class)
                .hasMessage(WidgetMediaStorage.MSG_NO_FILE)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertRejected(upload("a.png", new byte[0]), WidgetMediaStorage.MSG_NO_FILE);
    }

    @Test
    @DisplayName("원래 이름에서 경로를 떼고 200자로 자른다(확장자 유지)")
    void sanitizesOriginalName() {
        saveReturnsArgument();
        assertThat(storage.save(upload("../../etc/a.png", png(64))).getOrigNm()).isEqualTo("a.png");
        assertThat(storage.save(upload("C:\\Users\\me\\b.png", png(64))).getOrigNm()).isEqualTo("b.png");

        String longName = "가".repeat(300) + ".png";
        String cut = storage.save(upload(longName, png(64))).getOrigNm();
        assertThat(cut).hasSize(200).endsWith(".png");
    }

    @Test
    @DisplayName("메타 저장이 실패하면 디스크에 쓴 파일을 지운다")
    void removesFileWhenMetaSaveFails() throws IOException {
        when(repository.save(any(WidgetMedia.class))).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> storage.save(upload("a.png", png(64)))).isInstanceOf(IllegalStateException.class);
        assertThat(filesInTempDir()).isZero();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "../etc/passwd",
            "..%2F..%2Fetc%2Fpasswd",
            "0123456789abcdef0123456789abcde",       // 31자
            "0123456789abcdef0123456789abcdef0",     // 33자
            "0123456789ABCDEF0123456789ABCDEF",      // 대문자
            "01234567-89ab-cdef-0123-456789abcdef",  // 하이픈 있는 UUID
            "0123456789abcdef0123456789abcde/",
            "0123456789abcdef0123456789abcdeg"
    })
    @DisplayName("이상한 fileId 는 저장소를 보지 않고 찾을 수 없음으로 거절한다")
    void rejectsMalformedFileId(String fileId) {
        assertThatThrownBy(() -> storage.open(fileId)).isInstanceOf(WidgetMediaNotFoundException.class);
        assertThatThrownBy(() -> storage.meta(fileId)).isInstanceOf(WidgetMediaNotFoundException.class);
        verify(repository, never()).findById(anyString());
    }

    @Test
    @DisplayName("형식은 맞지만 메타 행이나 디스크 파일이 없으면 찾을 수 없음")
    void missingMetaOrFileIsNotFound() {
        String id = "0123456789abcdef0123456789abcdef";
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> storage.meta(id)).isInstanceOf(WidgetMediaNotFoundException.class);
        assertThatThrownBy(() -> storage.open(id)).isInstanceOf(WidgetMediaNotFoundException.class);
    }

    @Test
    @DisplayName("매직 넘버 판정 — 형식별·모르는 내용")
    void detectTable() {
        assertThat(MediaFormat.detect(PNG_MAGIC)).contains(MediaFormat.PNG);
        assertThat(MediaFormat.detect(JPEG_MAGIC)).contains(MediaFormat.JPEG);
        assertThat(MediaFormat.detect(GIF_MAGIC)).contains(MediaFormat.GIF);
        assertThat(MediaFormat.detect(WEBP_MAGIC)).contains(MediaFormat.WEBP);
        assertThat(MediaFormat.detect(MP4_MAGIC)).contains(MediaFormat.MP4);
        assertThat(MediaFormat.detect(WEBM_MAGIC)).contains(MediaFormat.WEBM);
        // RIFF 이지만 WEBP 가 아닌 것(WAV) · BMP · 빈 값
        assertThat(MediaFormat.detect(MediaTestFiles.concat(ascii("RIFF"), new byte[4], ascii("WAVE")))).isEmpty();
        assertThat(MediaFormat.detect(ascii("BM6\u0000\u0000\u0000"))).isEmpty();
        assertThat(MediaFormat.detect(new byte[0])).isEmpty();
        assertThat(MediaFormat.detect(null)).isEmpty();

        assertThat(MediaFormat.fromFileName("A.WebP")).contains(MediaFormat.WEBP);
        assertThat(MediaFormat.fromFileName("a.svg")).isEmpty();
        assertThat(MediaFormat.fromFileName("png")).isEmpty();
        assertThat(MediaFormat.fromFileName(null)).isEmpty();
    }
}
