import com.graphhopper.reader.*;
import com.graphhopper.reader.osm.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.geom.prep.*;
import org.locationtech.jts.operation.polygonize.Polygonizer;
import org.locationtech.jts.operation.union.UnaryUnionOp;
import org.locationtech.jts.index.strtree.STRtree;
import java.nio.file.*;
import java.util.*;
import java.io.*;

/** Offline, bounded-memory extraction from the pinned Germany PBF. No game database writes. */
public class ExtractFacilities {
  static final GeometryFactory GF=new GeometryFactory();
  static final ObjectMapper JSON=new ObjectMapper();
  static final Map<Long,ReaderRelation> relations=new LinkedHashMap<>();
  static final Map<Long,ReaderWay> ways=new LinkedHashMap<>();
  static final Set<Long> wantedWays=new HashSet<>();
  static final Map<Long,Coordinate> nodes=new HashMap<>();
  static final Map<Long,ReaderNode> entrances=new LinkedHashMap<>();
  static final List<ReaderElement> facilities=new ArrayList<>();
  static String tag(ReaderElement e,String k){return e.getTag(k,"");}
  static boolean selected(ReaderElement e){
    return Set.of("fire_station","hospital","police","emergency_service","rescue_station","training").contains(tag(e,"amenity"))
      || tag(e,"healthcare").equals("hospital")
      || Set.of("ambulance_station","disaster_response","air_rescue_service","water_rescue","water_rescue_station","lifeguard","lifeguard_base","mountain_rescue").contains(tag(e,"emergency"))
      || !tag(e,"emergency_service").isBlank() || !tag(e,"police").isBlank();
  }
  static boolean state(ReaderElement e){return tag(e,"boundary").equals("administrative") && tag(e,"admin_level").equals("4") && tag(e,"ISO3166-2").startsWith("DE-");}
  static void need(ReaderWay w){ways.put(w.getId(),w); for(long n:w.getNodes().toArray())nodes.putIfAbsent(n,null);}
  static Coordinate[] coordinates(ReaderWay w){
    Coordinate[] cs=new Coordinate[w.getNodes().size()];
    for(int i=0;i<cs.length;i++){cs[i]=nodes.get(w.getNodes().get(i));if(cs[i]==null)throw new IllegalArgumentException("Missing node in way "+w.getId());}
    return cs;
  }
  static Geometry shape(ReaderElement e){
    if(e instanceof ReaderNode n)return GF.createPoint(new Coordinate(n.getLon(),n.getLat()));
    if(e instanceof ReaderWay w){Coordinate[] cs=coordinates(w); if(cs.length<4 || !cs[0].equals2D(cs[cs.length-1]))throw new IllegalArgumentException("Unclosed facility area "+w.getId()); return GF.createPolygon(cs);}
    ReaderRelation r=(ReaderRelation)e;
    Polygonizer outer=new Polygonizer(),inner=new Polygonizer();
    for(var member:r.getMembers()){
      if(!Set.of("outer","inner","").contains(member.getRole()))continue;
      if(member.getType()!=ReaderElement.Type.WAY)throw new IllegalArgumentException("Nested area relation needs review "+r.getId());
      ReaderWay w=ways.get(member.getRef());if(w==null)throw new IllegalArgumentException("Missing member way in relation "+r.getId());
      (member.getRole().equals("inner")?inner:outer).add(GF.createLineString(coordinates(w)));
    }
    if(!outer.getDangles().isEmpty()||!outer.getCutEdges().isEmpty()||!inner.getDangles().isEmpty())throw new IllegalArgumentException("Incomplete area relation "+r.getId());
    Geometry g=UnaryUnionOp.union(outer.getPolygons());
    if(g==null)throw new IllegalArgumentException("Empty area relation "+r.getId());
    if(!inner.getPolygons().isEmpty())g=g.difference(UnaryUnionOp.union(inner.getPolygons()));
    return g;
  }
  static List<Object> ring(LineString line){List<Object> out=new ArrayList<>();for(Coordinate c:line.getCoordinates())out.add(new double[]{c.x,c.y});return out;}
  static List<Object> polygon(Polygon p){List<Object> out=new ArrayList<>();out.add(ring(p.getExteriorRing()));for(int i=0;i<p.getNumInteriorRing();i++)out.add(ring(p.getInteriorRingN(i)));return out;}
  static Map<String,Object> geometry(Geometry g){
    if(g instanceof Point p)return Map.of("type","Point","coordinates",new double[]{p.getX(),p.getY()});
    if(g instanceof Polygon p)return Map.of("type","Polygon","coordinates",polygon(p));
    List<Object> ps=new ArrayList<>();for(int i=0;i<g.getNumGeometries();i++)ps.add(polygon((Polygon)g.getGeometryN(i)));
    return Map.of("type","MultiPolygon","coordinates",ps);
  }
  static String ref(ReaderElement e){return (e instanceof ReaderNode?"node":e instanceof ReaderWay?"way":"relation")+":"+e.getId();}
  static Map<String,String> tags(ReaderElement e){Map<String,String> out=new TreeMap<>();for(var entry:e.getTags().entrySet())out.put(entry.getKey(),String.valueOf(entry.getValue()));return out;}
  public static void main(String[] args)throws Exception{
    if(args.length!=2)throw new IllegalArgumentException("ExtractFacilities source.osm.pbf output.ndjson");
    Path input=Path.of(args[0]),output=Path.of(args[1]),partial=Path.of(args[1]+".partial");
    if(Files.exists(output)||Files.exists(partial))throw new IllegalStateException("Existing extraction preserved: "+output);
    System.out.println("Extracting facility and state relations");
    try(OSMInputFile osm=new OSMInputFile(input.toFile()).setWorkerThreads(2).setSkipOptions(new SkipOptions(true,true,false)).open()){
      ReaderElement e;while((e=osm.getNext())!=null)if(e instanceof ReaderRelation r && (selected(e)||state(e))){relations.put(r.getId(),r); if(selected(e))facilities.add(e);for(var m:r.getMembers())if(m.getType()==ReaderElement.Type.WAY)wantedWays.add(m.getRef());}
    }
    System.out.println("Extracting facility areas and relation members");
    try(OSMInputFile osm=new OSMInputFile(input.toFile()).setWorkerThreads(2).setSkipOptions(new SkipOptions(true,false,true)).open()){
      ReaderElement e;while((e=osm.getNext())!=null)if(e instanceof ReaderWay w){if(selected(e)){facilities.add(e);need(w);}else if(wantedWays.contains(w.getId()))need(w);}
    }
    System.out.println("Resolving "+nodes.size()+" area vertices, facility points and mapped entrances");
    try(OSMInputFile osm=new OSMInputFile(input.toFile()).setWorkerThreads(2).setSkipOptions(new SkipOptions(false,true,true)).open()){
      ReaderElement e;while((e=osm.getNext())!=null)if(e instanceof ReaderNode n){if(nodes.containsKey(n.getId()))nodes.put(n.getId(),new Coordinate(n.getLon(),n.getLat()));if(selected(e))facilities.add(e);if(!tag(e,"entrance").isBlank()||tag(e,"emergency").equals("emergency_ward_entrance"))entrances.put(n.getId(),n);}
    }
    Map<String,PreparedGeometry> states=new TreeMap<>();
    for(var r:relations.values())if(state(r))states.put(tag(r,"ISO3166-2"),PreparedGeometryFactory.prepare(shape(r)));
    if(states.size()!=16)throw new IllegalStateException("Expected 16 complete German state boundaries; found "+states.size());
    STRtree entranceIndex=new STRtree();for(var e:entrances.values())entranceIndex.insert(shape(e).getEnvelopeInternal(),e);entranceIndex.build();
    int rejected=0,written=0;
    try(BufferedWriter writer=Files.newBufferedWriter(partial);BufferedWriter errors=Files.newBufferedWriter(Path.of(args[1]+".errors.ndjson"))){
      for(ReaderElement e:facilities){try{
        Geometry g=shape(e);if(g.isEmpty()||!g.isValid())throw new IllegalArgumentException("Invalid facility geometry "+ref(e));
        Point p=g.getInteriorPoint();String region="";for(var entry:states.entrySet())if(entry.getValue().covers(p)){region=entry.getKey();break;}
        if(region.isEmpty())continue;
        Map<String,Object> record=new LinkedHashMap<>();record.put("source",ref(e));record.put("tags",tags(e));record.put("geometry",geometry(g));record.put("lon",p.getX());record.put("lat",p.getY());record.put("state",region);
        List<Object> entryPoints=new ArrayList<>();Envelope bounds=new Envelope(g.getEnvelopeInternal());bounds.expandBy(.00015);
        for(Object obj:entranceIndex.query(bounds)){ReaderNode n=(ReaderNode)obj;if(g.distance(shape(n))<.00008)entryPoints.add(Map.of("source",ref(n),"lon",n.getLon(),"lat",n.getLat(),"tags",tags(n)));}
        record.put("entrances",entryPoints);
        List<String> members=new ArrayList<>();if(e instanceof ReaderRelation r)for(var m:r.getMembers())if(m.getType()==ReaderElement.Type.WAY)members.add("way:"+m.getRef());record.put("members",members);
        writer.write(JSON.writeValueAsString(record));writer.newLine();written++;
      }catch(IllegalArgumentException error){errors.write(JSON.writeValueAsString(Map.of("source",ref(e),"error",error.getMessage())));errors.newLine();rejected++;}}
    }
    Files.move(partial,output,StandardCopyOption.ATOMIC_MOVE);
    System.out.println("Extracted "+written+" candidate facilities; "+rejected+" geometries require review.");
  }
}
