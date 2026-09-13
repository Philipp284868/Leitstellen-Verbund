import com.graphhopper.reader.*;
import com.graphhopper.reader.osm.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import java.security.*;
import java.util.zip.GZIPOutputStream;

/** One offline extraction of actual water intake nodes from the pinned PBF.
 * Ponds without an explicitly mapped suction point, signs and fire service inlets
 * are deliberately not usable water intakes. No game or existing geodata writes. */
public class ExtractWater {
  static final ObjectMapper JSON=new ObjectMapper();
  static final Set<String> TAGS=Set.of("emergency","fire_hydrant:type","fire_hydrant:diameter","fire_hydrant:pressure","fire_hydrant:position","water_source","fire_hydrant:count","flow_rate","ref","name","access","disused","operational_status");
  public static void main(String[] args)throws Exception {
    if(args.length!=4)throw new IllegalArgumentException("ExtractWater source.osm.pbf output.ndjson.gz expectedSha256 snapshot");
    Path source=Path.of(args[0]),output=Path.of(args[1]),partial=Path.of(args[1]+".partial");
    if(Files.exists(output)||Files.exists(partial))throw new IllegalStateException("Existing extraction preserved");
    MessageDigest digest=MessageDigest.getInstance("SHA-256");
    try(InputStream input=Files.newInputStream(source)){byte[] buffer=new byte[1024*1024];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);}
    if(!HexFormat.of().formatHex(digest.digest()).equals(args[2]))throw new IllegalStateException("Pinned OSM input checksum mismatch");
    long count=0;
    try(BufferedWriter writer=new BufferedWriter(new OutputStreamWriter(new GZIPOutputStream(Files.newOutputStream(partial,StandardOpenOption.CREATE_NEW)),java.nio.charset.StandardCharsets.UTF_8));OSMInputFile osm=new OSMInputFile(source.toFile()).setWorkerThreads(2).setSkipOptions(new SkipOptions(false,true,true)).open()){
      writer.write(JSON.writeValueAsString(Map.of("schema",1,"sourceSha256",args[2],"snapshot",args[3],"license","ODbL-1.0","attribution","OpenStreetMap contributors")));writer.newLine();
      ReaderElement element;
      while((element=osm.getNext())!=null)if(element instanceof ReaderNode n && Set.of("fire_hydrant","suction_point").contains(n.getTag("emergency",""))){
        Map<String,String> properties=new TreeMap<>();
        for(String key:TAGS)if(n.hasTag(key))properties.put(key,String.valueOf(n.getTag(key)).substring(0,Math.min(250,String.valueOf(n.getTag(key)).length())));
        writer.write(JSON.writeValueAsString(Map.of("id","node:"+n.getId(),"lon",n.getLon(),"lat",n.getLat(),"properties",properties)));writer.newLine();
        count++;
      }
    }
    Files.move(partial,output,StandardCopyOption.ATOMIC_MOVE);
    System.out.println("Verified mapped water intake nodes: "+count+"; output "+output);
  }
}
