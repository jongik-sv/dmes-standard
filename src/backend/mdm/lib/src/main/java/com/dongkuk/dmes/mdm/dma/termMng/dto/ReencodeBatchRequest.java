package com.dongkuk.dmes.mdm.dma.termMng.dto;

/** {@code termMng} action={@code execute}(method=reencodeBatch) 요청 — D6 청크 폴링. */
public class ReencodeBatchRequest {

    /** 청크 크기. 미지정 시 500(design.md D6). */
    private Integer chunkSize;

    public Integer getChunkSize() { return chunkSize; }
    public void setChunkSize(Integer v) { this.chunkSize = v; }
}
