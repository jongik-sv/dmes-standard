package com.dongkuk.analog.scanner;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

@Data
@Slf4j
// todo : 이 클래스는 쓰레드로 동작하면서 디렉토리를 읽어서 LogScanner에 readBuffer를 실행해준다.
public class FileScanner {
    String dir;

    public void setDir(String dir) {
        this.dir = dir;
    }

    public FileScanner(String dir) {
        this.dir = dir;
    }

//    private void readFilesInDirectory() throws InterruptedException {
//        File directory = new File(dir);
//
//        if (directory.isDirectory()) {
//            File[] files = directory.listFiles((dir, name) -> name.endsWith(".log") && !name.equals("mpp.log"));
//
//            if (files != null) {
//                // 파일명을 기준으로 소팅합니다.
//                Arrays.sort(files, Comparator.comparing(File::getName));
//
//                for (File file : files) {
//                    readFile(file);
//                    Thread.sleep(1);
//                }
//            }
//        }
//    }

//    private void readFile(File file) {
//        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
//            readBuffer(reader);
//            reader.close();
//            // 처리가 완료되었으므로 파일명을 변경합니다.
//            String newFileName = file.getName().replace(".log", ".log.cmp");
//            File newFile = new File(file.getParent(), newFileName);
//            file.renameTo(newFile);
//        } catch (IOException e) {
//            e.printStackTrace();
//        } catch (InterruptedException e) {
//            throw new RuntimeException(e);
//        }
//    }
//
//    public void run() {
//        log.info("FileScanner 시작");
//        try {
//            // 연속 모드는 아래 EOQ를 보낼 수 없다.
//            while(isContinuesProcessing()) {
//                readFilesInDirectory();
//                Thread.sleep(1000);
//            }
//
//            // 다 끝났을때 EOQ를 보내는 예제
//            LogData logData = new LogData();
//            logData.setConStr(false);
//            logData.setEoq(true);
//            // 직접적으로 큐에 값을 넣는 것이 아닌 readBuffer를 실행하도록 변경한다.
////            queue.add(logData);
//        } catch (InterruptedException e) {
//            throw new RuntimeException(e);
//        }
//    }
}
