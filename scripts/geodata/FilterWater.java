import com.fasterxml.jackson.databind.*;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.geom.prep.*;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.util.zip.*;
/** Clip the compact extraction to the verified Germany boundary without rereading the PBF. */
public class FilterWater {
  static final ObjectMapper JSON=new ObjectMapper();static final GeometryFactory GF=new GeometryFactory();
  static LinearRing ring(JsonNode points){Coordinate[] c=new Coordinate[points.size()];for(int i=0;i<c.length;i++)c[i]=new Coordinate(points.get(i).get(0).asDouble(),points.get(i).get(1).asDouble());return GF.createLinearRing(c);}
  static Polygon polygon(JsonNode rings){LinearRing[] holes=new LinearRing[rings.size()-1];for(int i=1;i<rings.size();i++)holes[i-1]=ring(rings.get(i));return GF.createPolygon(ring(rings.get(0)),holes);}
  public static void main(String[] args)throws Exception {
    if(args.length!=3)throw new IllegalArgumentException("FilterWater raw.ndjson.gz boundary.geojson output.ndjson.gz");
    Path output=Path.of(args[2]);if(Files.exists(output))throw new IllegalStateException("Existing output preserved");
    JsonNode boundary=JSON.readTree(Path.of(args[1]).toFile());if(boundary.has("geometry"))boundary=boundary.get("geometry");
    var coordinates=boundary.get("coordinates");Geometry shape;
    if(boundary.get("type").asText().equals("Polygon"))shape=polygon(coordinates);else {Polygon[] polys=new Polygon[coordinates.size()];for(int i=0;i<polys.length;i++)polys[i]=polygon(coordinates.get(i));shape=GF.createMultiPolygon(polys);}
    var prepared=PreparedGeometryFactory.prepare(shape);long count=0,rejected=0;
    try(BufferedReader in=new BufferedReader(new InputStreamReader(new GZIPInputStream(Files.newInputStream(Path.of(args[0]))),java.nio.charset.StandardCharsets.UTF_8));BufferedWriter out=new BufferedWriter(new OutputStreamWriter(new GZIPOutputStream(Files.newOutputStream(output,StandardOpenOption.CREATE_NEW)),java.nio.charset.StandardCharsets.UTF_8))){
      out.write(in.readLine());out.newLine();String line;while((line=in.readLine())!=null){var row=JSON.readTree(line);if(prepared.covers(GF.createPoint(new Coordinate(row.get("lon").asDouble(),row.get("lat").asDouble())))){out.write(line);out.newLine();count++;}else rejected++;}
    }
    System.out.println("Germany water sources: "+count+"; outside verified boundary: "+rejected);
  }
}
