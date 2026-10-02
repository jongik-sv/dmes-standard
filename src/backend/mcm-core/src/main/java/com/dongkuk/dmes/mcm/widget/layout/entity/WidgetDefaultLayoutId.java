package com.dongkuk.dmes.mcm.widget.layout.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetDefaultLayout} 복합키 (LAYOUT_KEY, INST_ID). */
public class WidgetDefaultLayoutId implements Serializable {

    private String layoutKey;
    private String instId;

    public WidgetDefaultLayoutId() {}

    public WidgetDefaultLayoutId(String layoutKey, String instId) {
        this.layoutKey = layoutKey;
        this.instId = instId;
    }

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetDefaultLayoutId that)) return false;
        return Objects.equals(layoutKey, that.layoutKey) && Objects.equals(instId, that.instId);
    }

    @Override
    public int hashCode() { return Objects.hash(layoutKey, instId); }
}
