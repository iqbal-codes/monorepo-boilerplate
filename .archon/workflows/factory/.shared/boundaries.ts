export function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const full = match[0];
  const options = match[1].split(',').map((s) => s.trim());
  const out: string[] = [];
  for (const opt of options) {
    const replaced = pattern.replace(full, opt);
    out.push(...expandBraces(replaced));
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  let re = '^';
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      re += '[^/]';
      i += 1;
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      re += `\\${ch}`;
      i += 1;
    } else {
      re += ch;
      i += 1;
    }
  }
  re += '$';
  return new RegExp(re);
}

export function matchPathPattern(filePath: string, pattern: string): boolean {
  const cleanPath = filePath.replace(/^\.\//, '');
  for (const expanded of expandBraces(pattern.trim())) {
    const cleanPat = expanded.replace(/^\.\//, '').replace(/\/+$/, '');
    if (!cleanPat) continue;
    if (globToRegExp(cleanPat).test(cleanPath)) return true;
    // Allow directory prefix patterns like "packages/ui" or "packages/ui/"
    if (!cleanPat.includes('*') && cleanPath.startsWith(`${cleanPat}/`)) return true;
  }
  return false;
}

export function isRenderedUiFile(filePath: string): boolean {
  const clean = filePath.replace(/^\.\//, '');
  return /\.(tsx|jsx|css|scss|html|vue|svelte|astro|qml|xaml)$/i.test(clean);
}

export function auditBoundaries(
  changedFiles: string[],
  allowedFolders: readonly string[],
  forbiddenPaths: string[]
): { ok: boolean; outOfBounds: string[]; forbiddenHits: string[] } {
  const forbiddenHits: string[] = [];
  const outOfBounds: string[] = [];

  for (const file of changedFiles) {
    if (forbiddenPaths.some((pat) => matchPathPattern(file, pat))) {
      forbiddenHits.push(file);
      continue;
    }
    if (allowedFolders.length > 0 && !allowedFolders.some((folder) => file.startsWith(folder))) {
      outOfBounds.push(file);
    }
  }

  return {
    ok: forbiddenHits.length === 0 && outOfBounds.length === 0,
    outOfBounds,
    forbiddenHits,
  };
}
