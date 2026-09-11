/** Logging overrides are runtime-only: the verified graph configuration stays byte-identical.
 * GraphHopper 11 uses snake_case for Dropwizard server properties. */
export function routerArguments(jar, config, command = "server") {
  return [
    "-Xmx6g",
    "-Ddw.server.request_log.type=external",
    "-Ddw.logging.loggers.org\\.eclipse\\.jetty\\.server\\.RequestLog=WARN",
    "-Ddw.logging.loggers.com\\.graphhopper\\.resources\\.RouteResource=WARN",
    "-Ddw.logging.loggers.com\\.graphhopper\\.http\\.MultiExceptionMapper=WARN",
    "-jar",
    jar,
    command,
    config,
  ];
}
