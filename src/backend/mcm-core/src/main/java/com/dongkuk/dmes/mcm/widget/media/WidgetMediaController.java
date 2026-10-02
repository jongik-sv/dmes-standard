package com.dongkuk.dmes.mcm.widget.media;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.media.entity.WidgetMedia;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.MDC;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 미디어 위젯 파일 올리기·내려받기 REST — 스펙 2026-10-02-widget-admin-generic §5.1·§5.2.
 * <ul>
 *   <li>올리기: FE {@code POST /api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload} → 여기
 *       {@code POST /api/mcm/commWidgetMng/upload}(multipart 필드 {@code file}). 위젯관리 화면 RBAC({@code upload} 토큰).</li>
 *   <li>내려받기: FE {@code GET /api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/{fileId}} → 여기
 *       {@code GET /api/mcm/widgetMedia/file/{fileId}}. 로그인 사용자 누구나(AUTH_ONLY).
 *       본문이 {@link Resource} 라 Spring MVC 가 {@code Range} 요청을 206·{@code Content-Range} 로 처리한다.</li>
 * </ul>
 * 오류는 cactus {@code GlobalExceptionHandler} 와 같은 모양({@code {meta:{txId,success:false,code,message}}})으로 돌려준다 —
 * mcm-core 의 {@link BusinessException} 은 cactus 예외가 아니어서 전역 처리기가 500 으로 바꾸므로 여기서 직접 잡는다.
 */
@RestController
public class WidgetMediaController {

    /** 브라우저 개인 캐시 1일 — 같은 fileId 의 내용은 바뀌지 않는다(다시 올리면 새 fileId). */
    static final String CACHE_CONTROL = "private, max-age=86400";

    private final WidgetMediaStorage storage;

    public WidgetMediaController(WidgetMediaStorage storage) {
        this.storage = storage;
    }

    /** 미디어 올리기 → {@code { fileId, origNm, contentType, size }}. */
    @PostMapping("/api/mcm/commWidgetMng/upload")
    public Map<String, Object> upload(@RequestParam(name = "file", required = false) MultipartFile file) {
        WidgetMedia saved = storage.save(file);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fileId", saved.getFileId());
        body.put("origNm", saved.getOrigNm());
        body.put("contentType", saved.getContentType());
        body.put("size", saved.getFileSize());
        return body;
    }

    /** 미디어 내려받기 — 저장 형식·nosniff·inline·개인 캐시 1일. 없는 파일·이상한 fileId 는 404. */
    @GetMapping("/api/mcm/widgetMedia/file/{fileId}")
    public ResponseEntity<Resource> file(@PathVariable("fileId") String fileId) {
        WidgetMedia meta = storage.meta(fileId);
        Resource body = storage.open(fileId);
        ContentDisposition disposition = ContentDisposition.inline()
                .filename(meta.getOrigNm(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(meta.getContentType()))
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL)
                .body(body);
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, Object>> handleBusiness(BusinessException e) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("txId", MDC.get("txId"));
        meta.put("success", false);
        meta.put("code", e.getErrorCode().getCode());
        meta.put("message", e.getMessage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("meta", meta);
        return ResponseEntity.status(e.getErrorCode().getHttpStatus())
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    @ExceptionHandler(WidgetMediaNotFoundException.class)
    public ResponseEntity<Void> handleNotFound(WidgetMediaNotFoundException e) {
        return ResponseEntity.notFound().build();
    }
}
