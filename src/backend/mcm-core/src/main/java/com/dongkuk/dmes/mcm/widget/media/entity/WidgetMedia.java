package com.dongkuk.dmes.mcm.widget.media.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 미디어 위젯 파일 메타 — 스펙 2026-10-02-widget-admin-generic §4.3.
 * <p>파일 본체는 DB 가 아니라 {@code dmes.widget.media-dir} 아래 {@code {FILE_ID}}(확장자 없음)로 둔다.
 * 경로는 FILE_ID 로만 만들어 경로 조작을 막는다. CONTENT_TYPE 은 파일 앞 바이트(매직 넘버)로 정한 허용 목록 값만 들어간다.
 */
@Entity
@Table(name = "TB_MCM_WIDGET_MEDIA", schema = "MCMAPUSER")
public class WidgetMedia extends McmAuditEntity {

    /** 서버 생성 — UUID 하이픈 제거 32자(소문자 16진수). */
    @Id
    @Column(name = "FILE_ID", length = 40, nullable = false)
    private String fileId;

    @Column(name = "ORIG_NM", length = 200, nullable = false)
    private String origNm;

    @Column(name = "CONTENT_TYPE", length = 100, nullable = false)
    private String contentType;

    /** 바이트. */
    @Column(name = "FILE_SIZE", nullable = false)
    private Long fileSize;

    public WidgetMedia() {}

    public String getFileId() { return fileId; }
    public void setFileId(String fileId) { this.fileId = fileId; }
    public String getOrigNm() { return origNm; }
    public void setOrigNm(String origNm) { this.origNm = origNm; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
}
