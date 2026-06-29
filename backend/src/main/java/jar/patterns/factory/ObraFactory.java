package jar.patterns.factory;

import jar.models.Escultura;
import jar.models.Maqueta;
import jar.models.Obra;
import jar.models.Pintura;

import java.util.Map;

public class ObraFactory {

    public static Obra crearObra(Map<String, Object> data) {
        if (data == null || !data.containsKey("tipo")) {
            return null;
        }

        String tipo = (String) data.get("tipo");
        Long id = data.get("id") != null ? Long.valueOf(data.get("id").toString()) : null;
        String titulo = (String) data.get("titulo");
        String autor = (String) data.get("autor");
        Integer anio = data.get("anio") != null ? Integer.valueOf(data.get("anio").toString()) : null;
        String descripcion = (String) data.get("descripcion");
        Double posicionX = data.get("posicionX") != null ? Double.valueOf(data.get("posicionX").toString()) : 0.0;
        Double posicionY = data.get("posicionY") != null ? Double.valueOf(data.get("posicionY").toString()) : 0.0;
        Double posicionZ = data.get("posicionZ") != null ? Double.valueOf(data.get("posicionZ").toString()) : 0.0;

        if ("pintura".equalsIgnoreCase(tipo)) {
            String tecnica = (String) data.get("tecnica");
            return new Pintura(id, tipo, titulo, autor, anio, descripcion, posicionX, posicionY, posicionZ, tecnica);
        } else if ("escultura".equalsIgnoreCase(tipo)) {
            String material = (String) data.get("material");
            return new Escultura(id, tipo, titulo, autor, anio, descripcion, posicionX, posicionY, posicionZ, material);
        } else if ("maqueta".equalsIgnoreCase(tipo)) {
            String material = (String) data.get("material");
            return new Maqueta(id, tipo, titulo, autor, anio, descripcion, posicionX, posicionY, posicionZ, material);
        }

        // Si es otro tipo, se podría instanciar una Obra genérica o retornar null
        return null;
    }
}
