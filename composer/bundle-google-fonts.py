"""Bundle unmodified official Google Fonts files and audit their real capabilities.

Usage: python composer/bundle-google-fonts.py /path/to/sparse/google-fonts
The input must be a clean checkout of https://github.com/google/fonts.
"""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent
FAMILIES = ['Anton', 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Archivo Black',
            'Montserrat', 'Poppins', 'Manrope', 'DM Sans', 'Outfit', 'Space Grotesk',
            'Syne', 'Bricolage Grotesque', 'Josefin Sans', 'Raleway', 'Sora',
            'Rubik', 'Roboto Slab', 'Zilla Slab', 'Arvo']

def digest(data):
    return hashlib.sha256(data).hexdigest()

def bundle(source):
    origin = subprocess.check_output(['git', '-C', str(source), 'remote', 'get-url', 'origin'], text=True).strip()
    assert origin.rstrip('.git') == 'https://github.com/google/fonts'
    assert not subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip()
    revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    records = []
    for family in FAMILIES:
        slug = family.lower().replace(' ', '')
        category = 'apache' if family == 'Roboto Slab' else 'ofl'
        folder = source / category / slug
        metadata = (folder / 'METADATA.pb').read_text()
        assert re.search(r'name:\s*"' + re.escape(family) + '"', metadata)
        licence_name = 'LICENSE.txt' if category == 'apache' else 'OFL.txt'
        licence = (folder / licence_name).read_bytes()
        assert (b'Apache License' in licence and b'Version 2.0' in licence) if category == 'apache' else b'SIL OPEN FONT LICENSE Version 1.1' in licence
        target = ROOT / 'fonts' / slug
        target.mkdir(parents=True, exist_ok=True)
        for name in [licence_name, 'METADATA.pb'] + (['COPYRIGHT.txt'] if category == 'apache' else []):
            shutil.copyfile(folder / name, target / name)
        catalogue = {re.search(r'filename:\s*"([^"]+)"', block).group(1): {'weight': int(re.search(r'weight:\s*(\d+)', block).group(1)), 'style': re.search(r'style:\s*"([^"]+)"', block).group(1)} for block in re.findall(r'fonts\s*\{(.*?)\}', metadata, re.S)}
        files = []
        for name in sorted(set(re.findall(r'filename:\s*"([^"]+)"', metadata))):
            data = (folder / name).read_bytes()
            font = TTFont(folder / name)
            coverage = sorted(font.getBestCmap())
            axes = {a.axisTag: {'min': a.minValue, 'default': a.defaultValue, 'max': a.maxValue}
                    for a in font['fvar'].axes} if 'fvar' in font else {}
            weight = axes.get('wght', {'min': catalogue[name]['weight'], 'max': catalogue[name]['weight']})
            italic = bool(font['OS/2'].fsSelection & 1)
            assert all(ord(c) in coverage for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789£%.,!?')
            shutil.copyfile(folder / name, target / name)
            files.append({'file': f'{slug}/{name}', 'checksum': digest(data), 'size': len(data),
                          'format': 'truetype', 'style': 'italic' if italic else 'normal',
                          'weight_min': weight['min'], 'weight_max': weight['max'], 'axes': axes,
                          'catalogue_weight': catalogue[name]['weight'], 'internal_weight_class': font['OS/2'].usWeightClass,
                          'character_count': len(coverage), 'codepoints': coverage,
                          'source_url': f'https://github.com/google/fonts/blob/{revision}/{category}/{slug}/{name}'})
        assert files
        records.append({'family': family, 'licence': 'Apache 2.0' if category == 'apache' else 'SIL OFL 1.1', 'licence_file': f'{slug}/{licence_name}',
                        'licence_checksum': digest(licence), 'source_revision': revision,
                        'catalogue_url': 'https://fonts.google.com/specimen/' + family.replace(' ', '+'),
                        'subsets': sorted(set(re.findall(r'subsets:\s*"([^"]+)"', metadata))), 'files': files})
    out = ROOT.parent / 'supabase/functions/composer/font-manifest.mjs'
    out.write_text('// Generated from unmodified official Google Fonts files. Do not edit.\nexport const GOOGLE_FONTS=' + json.dumps(records, separators=(',', ':')) + ';\n')
    (ROOT / 'fonts/README.md').write_text('# Bundled Google Fonts\n\nUnmodified files from [Google Fonts](https://github.com/google/fonts/tree/' + revision + '). Each directory retains its licence and catalogue metadata. `font-manifest.mjs` records hashes, official catalogue weights, internal weight classes, actual styles/axes and the complete Unicode character map for every file. Rebuild with `python composer/bundle-google-fonts.py /path/to/google-fonts`. No synthetic bold, synthetic italic or system substitution is permitted.\n')
    print(json.dumps({'families': len(records), 'files': sum(len(r['files']) for r in records), 'revision': revision,
                      'bytes': sum(f['size'] for r in records for f in r['files'])}))

if __name__ == '__main__':
    bundle(pathlib.Path(sys.argv[1]).resolve())
