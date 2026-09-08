import com.graphhopper.reader.ReaderElement;
import com.graphhopper.reader.ReaderNode;
import com.graphhopper.reader.ReaderWay;
import com.graphhopper.reader.ReaderRelation;
import com.graphhopper.reader.osm.OSMInputFile;
import com.graphhopper.reader.osm.SkipOptions;
import com.carrotsearch.hppc.LongObjectHashMap;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.geom.prep.PreparedGeometryFactory;
import org.locationtech.jts.operation.polygonize.Polygonizer;
import org.locationtech.jts.operation.union.UnaryUnionOp;

/** Streams boundary relations, ways and nodes separately. Only selected anchors stay in memory. */
public class BuildIndex {
  record Road(String name, String roadClass, int bridge, int tunnel, String access) {}
  record Place(String type, long id, String kind, String name, String display, String region) {}
  static final Set<String> ROADS = Set.of("motorway","motorway_link","trunk","trunk_link","primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","residential","living_street","service","road","track");
  static final Set<String> PLACES = Set.of("city","town","village","hamlet","suburb","quarter","neighbourhood","locality","island","state","county");
  static final LongObjectHashMap<Road> anchors = new LongObjectHashMap<>();
  static final LongObjectHashMap<ArrayList<Place>> wayPlaces = new LongObjectHashMap<>();
  static final Map<Long,String> borderRoles = new LinkedHashMap<>();
  static final Map<Long,long[]> borderWays = new LinkedHashMap<>();
  static final Map<Long,Coordinate> borderNodes = new HashMap<>();
  static final GeometryFactory geometry = new GeometryFactory();
  static String tag(ReaderElement e, String key) { return e.getTag(key, ""); }
  static String label(ReaderElement e) { return e.getTag("name:de", e.getTag("name", "")); }
  static Place place(ReaderElement e) {
    String name=label(e), kind=tag(e,"place");
    String city=tag(e,"addr:city"), street=tag(e,"addr:street"), house=tag(e,"addr:housenumber");
    if (PLACES.contains(kind) && !name.isBlank()) { /* actual OSM settlement */ }
    else if (Set.of("hospital","fire_station","police","clinic").contains(tag(e,"amenity"))) { kind=tag(e,"amenity"); if(name.isBlank()) name=kind; }
    else if (!street.isBlank() && !house.isBlank()) { kind="address"; name=street+" "+house; }
    else if (e instanceof ReaderWay && ROADS.contains(tag(e,"highway")) && !name.isBlank()) kind="street";
    else if (tag(e,"natural").equals("peak") && !name.isBlank()) kind="peak";
    else return null;
    String region=city.isBlank()?tag(e,"addr:state"):city;
    String display=name+(region.isBlank()?"":", "+region)+(tag(e,"addr:postcode").isBlank()?"":" "+tag(e,"addr:postcode"));
    return new Place(e instanceof ReaderWay?"way":"node",e.getId(),kind,name,display,region);
  }
  static boolean road(ReaderWay w) {
    if(!ROADS.contains(tag(w,"highway")))return false;
    String access=w.getTag("motorcar",w.getTag("motor_vehicle",w.getTag("vehicle",tag(w,"access"))));
    return !Set.of("no","private","agricultural","forestry").contains(access);
  }
  static void insertPlace(PreparedStatement statement,Place p,double lon,double lat) throws SQLException {
    statement.setString(1,p.type());statement.setString(2,Long.toString(p.id()));statement.setString(3,p.kind());statement.setString(4,p.name());statement.setString(5,p.display());statement.setDouble(6,lon);statement.setDouble(7,lat);statement.setString(8,p.region());statement.addBatch();
  }
  static Geometry country() {
    if(borderWays.size()!=borderRoles.size())throw new IllegalStateException("Germany boundary has missing OSM ways.");
    Polygonizer outer=new Polygonizer(),inner=new Polygonizer();
    for(var entry:borderWays.entrySet()) {
      Coordinate[] points=new Coordinate[entry.getValue().length];
      for(int i=0;i<points.length;i++){points[i]=borderNodes.get(entry.getValue()[i]);if(points[i]==null)throw new IllegalStateException("Germany boundary has missing OSM node.");}
      (borderRoles.get(entry.getKey()).equals("inner")?inner:outer).add(geometry.createLineString(points));
    }
    if(!outer.getDangles().isEmpty()||!outer.getCutEdges().isEmpty()||!outer.getInvalidRingLines().isEmpty()||!inner.getDangles().isEmpty()||!inner.getCutEdges().isEmpty()||!inner.getInvalidRingLines().isEmpty())throw new IllegalStateException("Germany boundary rings are incomplete or invalid.");
    Geometry result=UnaryUnionOp.union(outer.getPolygons());
    if(!inner.getPolygons().isEmpty())result=result.difference(UnaryUnionOp.union(inner.getPolygons()));
    if(result==null||result.isEmpty()||!result.isValid())throw new IllegalStateException("Germany boundary polygon invalid.");
    return result;
  }
  static long removeOutside(Connection db,String table,Geometry boundary) throws SQLException {
    var prepared=PreparedGeometryFactory.prepare(boundary);long removed=0;
    try(Statement query=db.createStatement();ResultSet rows=query.executeQuery("SELECT id,lon,lat FROM "+table);PreparedStatement delete=db.prepareStatement("DELETE FROM "+table+" WHERE id=?")) {
      while(rows.next())if(!prepared.covers(geometry.createPoint(new Coordinate(rows.getDouble(2),rows.getDouble(3))))) {delete.setLong(1,rows.getLong(1));delete.addBatch();if(++removed%10000==0)delete.executeBatch();}
      delete.executeBatch();
    }
    db.commit();return removed;
  }
  static String ringJson(LineString ring) {
    StringJoiner points=new StringJoiner(",","[","]");
    for(Coordinate c:ring.getCoordinates())points.add("["+c.x+","+c.y+"]");
    return points.toString();
  }
  static String polygonJson(Polygon polygon) {
    StringJoiner rings=new StringJoiner(",","[","]");rings.add(ringJson(polygon.getExteriorRing()));
    for(int i=0;i<polygon.getNumInteriorRing();i++)rings.add(ringJson(polygon.getInteriorRingN(i)));
    return rings.toString();
  }
  static String boundaryJson(Geometry boundary) {
    if(boundary instanceof Polygon p)return "{\"type\":\"Polygon\",\"coordinates\":"+polygonJson(p)+"}";
    StringJoiner polygons=new StringJoiner(",","[","]");
    for(int i=0;i<boundary.getNumGeometries();i++)polygons.add(polygonJson((Polygon)boundary.getGeometryN(i)));
    return "{\"type\":\"MultiPolygon\",\"coordinates\":"+polygons+"}";
  }
  public static void main(String[] args) throws Exception {
    if(args.length!=2)throw new IllegalArgumentException("BuildIndex source.osm.pbf index.sqlite");
    Path input=Path.of(args[0]), output=Path.of(args[1]), partial=Path.of(args[1]+".partial");
    if(Files.exists(output)||Files.exists(partial))throw new IllegalStateException("Index exists; immutable data is not overwritten: "+output);
    try(OSMInputFile osm=new OSMInputFile(input.toFile()).setWorkerThreads(4).setSkipOptions(new SkipOptions(true,true,false)).open()) {
      ReaderElement element;
      while((element=osm.getNext())!=null)if(element instanceof ReaderRelation relation&&relation.getId()==51477)for(var member:relation.getMembers())if(member.getType()==ReaderElement.Type.WAY&&Set.of("outer","inner","").contains(member.getRole()))borderRoles.put(member.getRef(),member.getRole());
    }
    if(borderRoles.isEmpty())throw new IllegalStateException("Germany relation 51477 missing; full country source required.");
    System.out.println("Germany OSM boundary: "+borderRoles.size()+" ways.");
    long ways=0;
    try(OSMInputFile osm=new OSMInputFile(input.toFile()).setWorkerThreads(4).setSkipOptions(new SkipOptions(true,false,true)).open()) {
      ReaderElement element;
      while((element=osm.getNext())!=null) {
        if(!(element instanceof ReaderWay w)||w.getNodes().isEmpty())continue;
        if(borderRoles.containsKey(w.getId())){long[] ids=w.getNodes().toArray();borderWays.put(w.getId(),ids);for(long id:ids)borderNodes.put(id,null);}
        if(road(w)) {
          Road road=new Road(label(w),tag(w,"highway"),w.hasTag("bridge")&&!w.hasTag("bridge","no")?1:0,w.hasTag("tunnel")&&!w.hasTag("tunnel","no")?1:0,w.getTag("motorcar",w.getTag("motor_vehicle",w.getTag("vehicle",tag(w,"access")))));
          for(int i:new int[]{0,w.getNodes().size()/2,w.getNodes().size()-1}) {
            long id=w.getNodes().get(i);Road previous=anchors.get(id);
            if(previous==null||(previous.bridge()+previous.tunnel()>road.bridge()+road.tunnel())||(previous.name().isBlank()&&!road.name().isBlank()&&previous.bridge()+previous.tunnel()>=road.bridge()+road.tunnel()))anchors.put(id,road);
          }
        }
        Place p=place(w);
        if(p!=null) { long id=w.getNodes().get(0);ArrayList<Place> list=wayPlaces.get(id);if(list==null){list=new ArrayList<>();wayPlaces.put(id,list);}list.add(p); }
        if(++ways%2_000_000==0)System.out.println("OSM ways "+ways+", road anchors "+anchors.size()+", place anchors "+wayPlaces.size());
      }
    }
    System.out.println("Selected "+anchors.size()+" real road anchors; resolving OSM node coordinates.");
    Class.forName("org.sqlite.JDBC");
    try(Connection db=DriverManager.getConnection("jdbc:sqlite:"+partial.toAbsolutePath())) {
      try(Statement s=db.createStatement()) {
        s.execute("PRAGMA journal_mode=OFF");s.execute("PRAGMA synchronous=OFF");s.execute("PRAGMA temp_store=MEMORY");s.execute("PRAGMA cache_size=-131072");
        s.execute("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
        s.execute("CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL NOT NULL,lat REAL NOT NULL,name TEXT NOT NULL,road_class TEXT NOT NULL,bridge INTEGER NOT NULL DEFAULT 0,tunnel INTEGER NOT NULL DEFAULT 0,access TEXT NOT NULL DEFAULT '')");
        s.execute("CREATE TABLE places(id INTEGER PRIMARY KEY,osm_type TEXT NOT NULL,osm_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,display_name TEXT NOT NULL,lon REAL NOT NULL,lat REAL NOT NULL,region TEXT NOT NULL)");
      }
      db.setAutoCommit(false);
      long nodeCount=0,anchorCount=0,placeCount=0;
      try(PreparedStatement a=db.prepareStatement("INSERT INTO anchors VALUES(?,?,?,?,?,?,?,?)");PreparedStatement p=db.prepareStatement("INSERT INTO places(osm_type,osm_id,kind,name,display_name,lon,lat,region) VALUES(?,?,?,?,?,?,?,?)");OSMInputFile osm=new OSMInputFile(input.toFile()).setWorkerThreads(4).setSkipOptions(new SkipOptions(false,true,true)).open()) {
        ReaderElement element;
        while((element=osm.getNext())!=null) {
          if(!(element instanceof ReaderNode n))continue;
          long id=n.getId();double lon=n.getLon(),lat=n.getLat();
          if(borderNodes.containsKey(id))borderNodes.put(id,new Coordinate(lon,lat));
          Road r=anchors.get(id);
          if(r!=null) {a.setLong(1,id);a.setDouble(2,lon);a.setDouble(3,lat);a.setString(4,r.name());a.setString(5,r.roadClass());a.setInt(6,r.bridge());a.setInt(7,r.tunnel());a.setString(8,r.access());a.addBatch();anchorCount++;}
          Place nodePlace=place(n);if(nodePlace!=null){insertPlace(p,nodePlace,lon,lat);placeCount++;}
          ArrayList<Place> list=wayPlaces.get(id);if(list!=null)for(Place item:list){insertPlace(p,item,lon,lat);placeCount++;}
          if(++nodeCount%100_000==0){a.executeBatch();p.executeBatch();db.commit();}
          if(nodeCount%10_000_000==0)System.out.println("OSM nodes "+nodeCount+", indexed anchors "+anchorCount+", places/addresses "+placeCount);
        }
        a.executeBatch();p.executeBatch();db.commit();
      }
      // Strings and source references are no longer needed while SQLite builds its spatial/text indexes.
      anchors.clear();wayPlaces.clear();System.gc();
      Geometry boundary=country();
      System.out.println("Germany boundary resolved; clipping anchors and places to national territory.");
      anchorCount-=removeOutside(db,"anchors",boundary);placeCount-=removeOutside(db,"places",boundary);
      Files.writeString(output.resolveSibling("boundary.geojson"),boundaryJson(boundary));
      db.setAutoCommit(true);
      try(Statement s=db.createStatement()) {
        System.out.println("Building road-anchor RTree.");
        s.execute("CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat)");
        s.execute("INSERT INTO anchors_rtree SELECT id,lon,lon,lat,lat FROM anchors");
        System.out.println("Building place/address RTree.");
        s.execute("CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat)");
        s.execute("INSERT INTO places_rtree SELECT id,lon,lon,lat,lat FROM places");
        System.out.println("Building full-text search and lookup indexes.");
        s.execute("CREATE VIRTUAL TABLE places_fts USING fts5(name,display_name,content='places',content_rowid='id',tokenize='unicode61 remove_diacritics 2')");
        s.execute("INSERT INTO places_fts(places_fts) VALUES('rebuild')");
        s.execute("CREATE INDEX places_kind ON places(kind)");
        s.execute("CREATE INDEX places_exact_name ON places(name COLLATE NOCASE,kind)");
        s.execute("CREATE UNIQUE INDEX places_osm ON places(osm_type,osm_id)");
        s.execute("INSERT INTO metadata VALUES('schema','1'),('world_id','germany-1'),('snapshot','2026-09-07'),('anchor_count','"+anchorCount+"'),('place_count','"+placeCount+"')");
        s.execute("ANALYZE");
        System.out.println("Checking completed SQLite index integrity.");
        try(ResultSet check=s.executeQuery("PRAGMA quick_check")){if(!check.next()||!"ok".equals(check.getString(1)))throw new IllegalStateException("SQLite integrity check failed");}
      }
      System.out.println("Complete index: "+anchorCount+" road anchors, "+placeCount+" searchable OSM places/addresses.");
    }
    Files.move(partial,output,StandardCopyOption.ATOMIC_MOVE);
  }
}
