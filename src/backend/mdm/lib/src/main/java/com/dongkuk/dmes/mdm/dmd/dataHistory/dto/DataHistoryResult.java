package com.dongkuk.dmes.mdm.dmd.dataHistory.dto;

import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import java.util.List;

/** {@code dataHistory} action={@code search} 응답. */
public class DataHistoryResult {

    private DataItemHeader header;
    private String target;
    private String key;
    /** valid_from 오름차순(H1). */
    private List<DataHistoryRow> rows;
    /** OPEN / CLOSED(소멸) / NONE(행 없음). */
    private String state;

    public DataHistoryResult() {
    }

    public DataHistoryResult(DataItemHeader header, String target, String key, List<DataHistoryRow> rows, String state) {
        this.header = header;
        this.target = target;
        this.key = key;
        this.rows = rows;
        this.state = state;
    }

    public DataItemHeader getHeader() { return header; }
    public String getTarget() { return target; }
    public String getKey() { return key; }
    public List<DataHistoryRow> getRows() { return rows; }
    public String getState() { return state; }

    public void setHeader(DataItemHeader v) { this.header = v; }
    public void setTarget(String v) { this.target = v; }
    public void setKey(String v) { this.key = v; }
    public void setRows(List<DataHistoryRow> v) { this.rows = v; }
    public void setState(String v) { this.state = v; }
}
