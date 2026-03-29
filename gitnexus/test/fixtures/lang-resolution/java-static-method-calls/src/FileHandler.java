import org.apache.commons.io.FileUtils;

public class FileHandler {
    public void handleFile() {
        // Static method call with scoped_identifier receiver (FileCopyUtils)
        FileCopyUtils.copy(new byte[10], new java.io.File("out.txt"));

        // Static method call with fully-qualified field_access receiver
        FileUtils.forceDelete(new java.io.File("temp.txt"));
    }
}

class FileCopyUtils {
    public static void copy(byte[] data, java.io.File dest) {
        // implementation
    }
}
