package jar.models;

public class Pintura extends Obra {
    private String tecnica;

    public Pintura() {
        super();
    }

    public Pintura(Long id, String tipo, String titulo, String autor, Integer anio, String descripcion, Double posicionX, Double posicionY, Double posicionZ, String tecnica) {
        super(id, tipo, titulo, autor, anio, descripcion, posicionX, posicionY, posicionZ);
        this.tecnica = tecnica;
    }

    public String getTecnica() {
        return tecnica;
    }

    public void setTecnica(String tecnica) {
        this.tecnica = tecnica;
    }
}
