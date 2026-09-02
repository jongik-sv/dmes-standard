package com.dongkuk.caravan.console.host;

import java.io.Serializable;
import java.util.Objects;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * {@link AppHostEntity} 복합 PK 클래스.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AppHostId implements Serializable {

    private String appHostId;
    private String worksCd;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AppHostId that)) return false;
        return Objects.equals(appHostId, that.appHostId)
                && Objects.equals(worksCd, that.worksCd);
    }

    @Override
    public int hashCode() {
        return Objects.hash(appHostId, worksCd);
    }
}
