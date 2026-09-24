package com.dongkuk.dmes.mdm.dmd.dataHistory.dto;

import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.MaruDataOption;
import java.util.List;

/** {@code dataHistory} action={@code view} 응답 — 머리는 항목 관리와 같은 모양이다. */
public class DataHistoryViewResult {

    private List<MaruDataOption> maruDataOptions;
    private DataItemHeader header;

    public DataHistoryViewResult() {
    }

    public DataHistoryViewResult(List<MaruDataOption> maruDataOptions, DataItemHeader header) {
        this.maruDataOptions = maruDataOptions;
        this.header = header;
    }

    public List<MaruDataOption> getMaruDataOptions() { return maruDataOptions; }
    public DataItemHeader getHeader() { return header; }

    public void setMaruDataOptions(List<MaruDataOption> v) { this.maruDataOptions = v; }
    public void setHeader(DataItemHeader v) { this.header = v; }
}
