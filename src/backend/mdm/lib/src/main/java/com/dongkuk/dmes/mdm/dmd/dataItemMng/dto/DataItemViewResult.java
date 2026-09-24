package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

import java.util.List;

/** {@code dataItemMng} action={@code view} 응답. */
public class DataItemViewResult {

    private List<MaruDataOption> maruDataOptions;
    /** maruDataId 를 주었을 때만. */
    private DataItemHeader header;

    public DataItemViewResult() {
    }

    public DataItemViewResult(List<MaruDataOption> maruDataOptions, DataItemHeader header) {
        this.maruDataOptions = maruDataOptions;
        this.header = header;
    }

    public List<MaruDataOption> getMaruDataOptions() { return maruDataOptions; }
    public DataItemHeader getHeader() { return header; }

    public void setMaruDataOptions(List<MaruDataOption> v) { this.maruDataOptions = v; }
    public void setHeader(DataItemHeader v) { this.header = v; }
}
