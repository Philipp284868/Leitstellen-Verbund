#!/usr/bin/env python3
"""Run as the AMP OS user in an interactive SSH terminal, never the AMP console.
The operator types a fine-grained Contents:read token; no secret argument/env.
"""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.request

REPOS = ('Philipp284868/Leitstellen-Verbund', 'Philipp284868/AMP-Caddy-HTTPS')
PROBE = 'Philipp284868/Leitstellen-Verbund-Privatzugriffstest'
PROBE_TEXT = b'Leitstellen-Verbund private deployment access probe v1\n'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def query(path, token=None):
    headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Leitstellen-AMP-access-setup'}
    if token:headers['Authorization']='Bearer '+token
    try:
        with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request('https://api.github.com'+path,headers=headers),timeout=30) as response:
            return response.status,json.loads(response.read(1024*1024))
    except urllib.error.HTTPError as error:
        return error.code,{}
    except Exception:
        raise ValueError('GitHub-Pruefung nicht erreichbar; bisheriger Zugang unveraendert.') from None


def safe(path):
    path=Path(os.path.abspath(path))
    for parent in (path,*path.parents):
        if parent.is_symlink():raise ValueError('Symbolische Links im Zugangspfad sind nicht erlaubt.')
    return path


def configure(game, caddy):
    if sys.platform != 'linux' or not sys.stdin.isatty():
        raise ValueError('Bitte als AMP-Betriebssystembenutzer in einem interaktiven SSH-Terminal starten. Keine Eingabe ueber AMP-Konsole, Pipe oder Chat.')
    game=safe(game);caddy=safe(caddy)
    if not (game/'node/bin/node').is_file() or not (game/'launcher/runtime.mjs').is_file() or not (caddy/'private-update.py').is_file():
        raise ValueError('Gepruefte lokale Starterpakete zuerst in die vorhandenen Instanzpfade uebertragen.')
    targets=[safe(game/'shared/secrets/github-read-token'),safe(caddy/'private/secrets/github-read-token')]
    for target in targets:
        for parent in (target.parent.parent,target.parent):
            if parent.exists() and parent.stat().st_uid != os.getuid():
                raise ValueError('Instanzpfad gehoert nicht dem aktuellen AMP-Betriebssystembenutzer.')
    print('Einmalige Eingabe: Fine-grained GitHub-Token, ausgewaehlte Repositories, ausschliesslich Contents: Read-only und Metadata: Read-only.')
    print('Fuer diesen Nachweis zusaetzlich das private Testrepository auswaehlen. Keine Admin-/Issues-/Actions-Schreibrechte.')
    token=getpass.getpass('GitHub-Lesezugang (Eingabe unsichtbar): ')
    if not re.fullmatch(r'[A-Za-z0-9_]{20,512}',token):
        raise ValueError('Unzulaessiges Zugangsformat. Nichts gespeichert.')
    for repo in REPOS:
        status,metadata=query('/repos/'+repo,token)
        if status != 200 or metadata.get('full_name','').lower()!=repo.lower():
            raise ValueError('Mindestens eines der beiden Repositories ist mit diesem Lesezugang nicht erreichbar. Nichts gespeichert.')
    status,metadata=query('/repos/'+PROBE,token)
    if status!=200 or metadata.get('private') is not True:
        raise ValueError('Private Testressource nicht bestaetigt. Nichts gespeichert.')
    status,content=query('/repos/'+PROBE+'/contents/probe.txt',token)
    if status!=200 or content.get('encoding')!='base64' or base64.b64decode(content.get('content',''))!=PROBE_TEXT:
        raise ValueError('Privater Leseabruf fehlgeschlagen. Contents-Leserecht pruefen; nichts gespeichert.')
    status,_=query('/repos/'+PROBE)
    if status!=404:
        raise ValueError('Anonymer Zugriffsausschluss der Testressource nicht bestaetigt. Nichts gespeichert.')
    # Validate every target before changing either credential. Files stay outside
    # config backups, release directories, the game webroot and AMP exports.
    for target in targets:
        safe(target)
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        target.parent.chmod(0o700)
        if target.exists() and (not target.is_file() or target.stat().st_uid!=os.getuid() or target.stat().st_nlink!=1):
            raise ValueError('Vorhandene Zugangsdatei ist nicht eindeutig zugeordnet. Nichts ersetzt.')
    for target in targets:
        fd,name=tempfile.mkstemp(prefix='.credential-',dir=target.parent)
        try:
            with os.fdopen(fd,'w') as output:
                output.write(token+'\n');output.flush();os.fsync(output.fileno())
            os.chmod(name,0o600);os.replace(name,target)
        finally:
            if os.path.exists(name):os.unlink(name)
    token=None
    print('Privater Inhaltsabruf und anonymer Zugriffsausschluss erfolgreich. Lesezugang geschuetzt fuer beide AMP-Instanzen gespeichert. Keine Spiel- oder Zertifikatsdaten geaendert.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-root',required=True)
    parser.add_argument('--caddy-base',required=True)
    args=parser.parse_args()
    try:configure(args.game_root,args.caddy_base)
    except Exception as error:
        print(str(error) if isinstance(error,ValueError) else 'Zugangseinrichtung fehlgeschlagen; keine Zugangsdaten in Diagnoseausgabe.',file=sys.stderr)
        sys.exit(1)
