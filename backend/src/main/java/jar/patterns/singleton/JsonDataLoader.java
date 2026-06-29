package jar.patterns.singleton;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class JsonDataLoader {
    private static JsonDataLoader instance;
    private List<Map<String, Object>> obrasData;

    private JsonDataLoader() {
        this.obrasData = new ArrayList<>();
        cargarDatos();
    }

    public static synchronized JsonDataLoader getInstance() {
        if (instance == null) {
            instance = new JsonDataLoader();
        }
        return instance;
    }

    private void cargarDatos() {
        try {
            ObjectMapper mapper = new ObjectMapper();
            InputStream is = getClass().getResourceAsStream("/obras.json");
            if (is != null) {
                obrasData = mapper.readValue(is, new TypeReference<List<Map<String, Object>>>() {});
            } else {
                System.err.println("No se encontró el archivo obras.json en el classpath.");
            }
        } catch (Exception e) {
            System.err.println("Error al cargar obras.json: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public List<Map<String, Object>> getObrasData() {
        return obrasData;
    }
}
