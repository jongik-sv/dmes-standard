package usecase.dto;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

import java.time.LocalDateTime;

@SuppressFBWarnings("UWF_UNWRITTEN_FIELD")
public class ServiceDto {
    private String id;
    private Integer no;
    private LocalDateTime startData;

    public String getId() {
        return id;
    }

    public Integer getNo() {
        return no;
    }

    public LocalDateTime getStartData() {
        return startData;
    }

    @Override
    public String toString() {
        return "ServiceDto{" +
                "id='" + id + '\'' +
                ", no=" + no +
                ", startData=" + startData +
                '}';
    }
}
