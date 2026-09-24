package com.dongkuk.dmes.mdm.dma.termMng.dto;

/** {@code termMng} action={@code execute} 응답 — 청크 진행 상태(D6). */
public class ReencodeBatchResult {

    private boolean enabled;
    private int processed;
    private int remaining;
    private boolean done;

    public ReencodeBatchResult() {
    }

    public ReencodeBatchResult(boolean enabled, int processed, int remaining, boolean done) {
        this.enabled = enabled;
        this.processed = processed;
        this.remaining = remaining;
        this.done = done;
    }

    public boolean isEnabled() { return enabled; }
    public int getProcessed() { return processed; }
    public int getRemaining() { return remaining; }
    public boolean isDone() { return done; }

    public void setEnabled(boolean v) { this.enabled = v; }
    public void setProcessed(int v) { this.processed = v; }
    public void setRemaining(int v) { this.remaining = v; }
    public void setDone(boolean v) { this.done = v; }
}
