package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

import java.util.List;

/** {@code dataCateEdit} action={@code compare} 응답 — {@code DataCategoryResolver.Preview} 그대로 옮긴 것. */
public class CateCompareResult {

    private boolean invalid;
    private List<String> codes;
    private int count;
    /**
     * 매칭된 항목의 코드·이름(2026-09-30). 화면의 소속 목록이 이름까지 그린다 — {@code dataCateEdit.view} 의
     * {@code items} 는 TABLE 카테고리에서만 채워져서, REGEX 는 여기서 이름을 얻어야 한다.
     */
    private List<Item> items;

    public boolean isInvalid() { return invalid; }
    public List<String> getCodes() { return codes; }
    public int getCount() { return count; }
    public List<Item> getItems() { return items; }

    public void setInvalid(boolean v) { this.invalid = v; }
    public void setCodes(List<String> v) { this.codes = v; }
    public void setCount(int v) { this.count = v; }
    public void setItems(List<Item> v) { this.items = v; }

    /** 매칭된 항목 한 줄. */
    public record Item(String code, String name) {
    }
}
