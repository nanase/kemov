/**
 * Parsing and validating the `<name>=<url>` arguments screenshot.js takes.
 *
 * Split out from screenshot.js so this can be tested without pulling in
 * playwright or touching the filesystem.
 */

const reservedNames = new Set(['.', '..']);

/**
 * Parses one `<name>=<url>` argument. `name` becomes a filename prefix
 * (`<name>-<colorScheme>-<width>.png`), so it must be a single path
 * component: no `/` or `\`, and not `.` or `..`. Left otherwise, a `name`
 * containing `/` writes outside `outputDir` or into a directory that was
 * never created.
 */
function parseTarget(arg) {
  const separator = arg.indexOf('=');
  if (separator < 1) {
    // separator < 1 also catches an empty name ("=http://..."): index 0
    // leaves nothing before the "=".
    throw new Error(`expected <name>=<url>, got "${arg}"`);
  }

  const name = arg.slice(0, separator);
  const url = arg.slice(separator + 1);

  try {
    new URL(url);
  } catch {
    throw new Error(`url must be an absolute URL, got "${url}"`);
  }

  if (name.includes('/') || name.includes('\\') || reservedNames.has(name)) {
    throw new Error(`name must be a single filename with no "/", "\\", "." or "..", got "${name}"`);
  }

  return { name, url };
}

/**
 * Parses every `<name>=<url>` argument and rejects a repeated `name` before
 * any screenshot is taken. Two targets sharing a name would write the same
 * PNG path, so the later one would silently overwrite the earlier one.
 */
export function parseTargets(args) {
  const targets = args.map(parseTarget);
  const seen = new Set();

  for (const { name } of targets) {
    if (seen.has(name)) {
      throw new Error(`duplicate name "${name}": every target needs a distinct name`);
    }
    seen.add(name);
  }

  return targets;
}
