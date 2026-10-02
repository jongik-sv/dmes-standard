package com.dongkuk.dmes.mcm.widget.media;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.media.entity.WidgetMedia;
import com.dongkuk.dmes.mcm.widget.media.repository.WidgetMediaRepository;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * 미디어 위젯 파일 저장소 — 스펙 2026-10-02-widget-admin-generic §4.3·§5.2(미디어 올리기)·W-D29.
 * <ul>
 *   <li>본체는 {@code dmes.widget.media-dir}(기본 {@code ./data/widget-media}, 실행 폴더 기준) 아래 {@code {fileId}}
 *       (확장자 없음)로 둔다. 폴더가 없으면 첫 저장 때 만든다.</li>
 *   <li>fileId 는 서버가 만든 UUID 하이픈 제거 32자뿐이다. 그 밖 모양({@code ../} 등)은 디스크·DB 를 보기 전에
 *       {@link WidgetMediaNotFoundException} 으로 거절해 경로 조작을 막는다.</li>
 *   <li>형식은 확장자와 앞 바이트(매직 넘버)를 함께 본다. 둘이 같은 종류(이미지끼리·동영상끼리)여야 하고, 저장 형식
 *       (CONTENT_TYPE)과 크기 상한은 매직 넘버로 정한 형식을 따른다 — 이름만 .png 인 SVG·html 은 거절된다.</li>
 * </ul>
 */
@Component
public class WidgetMediaStorage {

    private static final Logger log = LoggerFactory.getLogger(WidgetMediaStorage.class);

    static final String MSG_NO_FILE = "올릴 파일이 없습니다";
    static final String MSG_BAD_FORMAT = "올릴 수 없는 파일 형식입니다(png·jpg·gif·webp·mp4·webm)";
    static final String MSG_TOO_LARGE = "이미지는 10MB, 동영상은 100MB 까지 올릴 수 있습니다";
    static final String MSG_SAVE_FAILED = "파일을 저장하지 못했습니다";

    /** ORIG_NM 컬럼 길이(§4.3). */
    private static final int ORIG_NM_MAX = 200;
    private static final Pattern FILE_ID = Pattern.compile("^[0-9a-f]{32}$");

    private final WidgetMediaRepository repository;
    private final Path baseDir;

    public WidgetMediaStorage(WidgetMediaRepository repository,
                              @Value("${dmes.widget.media-dir:./data/widget-media}") String mediaDir) {
        this.repository = repository;
        this.baseDir = Paths.get(mediaDir).toAbsolutePath().normalize();
    }

    /**
     * 올린 파일을 검사해 디스크에 쓰고 메타 행을 저장한다.
     *
     * @throws BusinessException 파일 없음({@code REQUIRED_VALUE}), 형식·크기 거절({@code INVALID_VALUE}),
     *                           디스크 쓰기 실패({@code INTERNAL_ERROR})
     */
    public WidgetMedia save(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, MSG_NO_FILE);
        }
        String origNm = cleanName(file.getOriginalFilename());
        MediaFormat byName = MediaFormat.fromFileName(origNm)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, MSG_BAD_FORMAT));
        MediaFormat byContent = MediaFormat.detect(readHead(file))
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, MSG_BAD_FORMAT));
        if (byName.isVideo() != byContent.isVideo()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_BAD_FORMAT);
        }
        if (file.getSize() > byContent.maxBytes()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_TOO_LARGE);
        }

        String fileId = UUID.randomUUID().toString().replace("-", "");
        Path target = baseDir.resolve(fileId);
        long written;
        try {
            Files.createDirectories(baseDir);
            try (InputStream in = file.getInputStream()) {
                written = Files.copy(in, target);
            }
        } catch (IOException e) {
            deleteQuietly(target);
            log.warn("[WidgetMediaStorage] 파일 쓰기 실패 fileId={} dir={}", fileId, baseDir, e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, MSG_SAVE_FAILED);
        }

        WidgetMedia media = new WidgetMedia();
        media.setFileId(fileId);
        media.setOrigNm(origNm);
        media.setContentType(byContent.contentType());
        media.setFileSize(written);
        try {
            return repository.save(media);
        } catch (RuntimeException e) {
            deleteQuietly(target);
            throw e;
        }
    }

    /** fileId 의 메타 행. 모양이 틀리거나 행이 없으면 {@link WidgetMediaNotFoundException}. */
    public WidgetMedia meta(String fileId) {
        requireValidId(fileId);
        return repository.findById(fileId).orElseThrow(() -> new WidgetMediaNotFoundException(fileId));
    }

    /** fileId 의 디스크 파일. 모양이 틀리거나 파일이 없으면 {@link WidgetMediaNotFoundException}. */
    public Resource open(String fileId) {
        requireValidId(fileId);
        Path path = baseDir.resolve(fileId).normalize();
        if (!path.startsWith(baseDir) || !Files.isRegularFile(path)) {
            throw new WidgetMediaNotFoundException(fileId);
        }
        return new FileSystemResource(path);
    }

    private static void requireValidId(String fileId) {
        if (fileId == null || !FILE_ID.matcher(fileId).matches()) {
            throw new WidgetMediaNotFoundException(fileId);
        }
    }

    private static byte[] readHead(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes(MediaFormat.HEADER_BYTES);
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_BAD_FORMAT);
        }
    }

    /** 브라우저가 보낸 이름에서 경로(/ \)를 떼고, 200자를 넘으면 확장자를 남긴 채 앞부분만 둔다. */
    static String cleanName(String raw) {
        String name = raw == null ? "" : raw;
        int cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        name = name.substring(cut + 1).strip();
        if (name.length() <= ORIG_NM_MAX) return name;
        int dot = name.lastIndexOf('.');
        String ext = dot > 0 ? name.substring(dot) : "";
        if (ext.length() >= ORIG_NM_MAX) return name.substring(0, ORIG_NM_MAX);
        return name.substring(0, ORIG_NM_MAX - ext.length()) + ext;
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.warn("[WidgetMediaStorage] 정리 실패 path={}", path, e);
        }
    }
}
