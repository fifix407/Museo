package jar.models;

public class Escultura extends Obra {
    private String material;

    public Escultura() {
        super();
    }

    public Escultura(Long id, String tipo, String titulo, String autor, Integer anio, String descripcion, Double posicionX, Double posicionY, Double posicionZ, String material) {
        super(id, tipo, titulo, autor, anio, descripcion, posicionX, posicionY, posicionZ);
        this.material = material;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }
}
