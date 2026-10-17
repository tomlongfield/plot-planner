// Validates every file in crops/ against schema/crop.schema.json, plus a few
// rules a schema can't express. Run by `npm run validate:crops` and in CI.
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/crop.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

const dir = path.join(root, 'crops');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const seenVarieties = new Set();
let failed = 0;

for (const file of files) {
  const problems = [];
  let crop;
  try {
    crop = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    problems.push(`not valid JSON: ${e.message}`);
  }
  if (crop) {
    if (!validate(crop)) for (const err of validate.errors) problems.push(`${err.instancePath || '/'} ${err.message}`);
    if (crop.id && `${crop.id}.json` !== file) problems.push(`id "${crop.id}" must match the file name`);
    const kinds = new Set((crop.timing ?? []).map((t) => t.kind));
    if (!kinds.has('sowIndoor') && !kinds.has('sowOutdoor') && !kinds.has('plantOut') && !kinds.has('overwinter'))
      problems.push('needs at least one sowing or planting rule');
    if (kinds.has('sowIndoor') && !crop.moduleDays) problems.push('sowIndoor needs moduleDays');
    for (const v of crop.varieties ?? []) {
      if (v.cropId !== crop.id) problems.push(`variety ${v.id} has cropId ${v.cropId}`);
      if (!v.id.startsWith(`${crop.id}--`)) problems.push(`variety id ${v.id} must start with "${crop.id}--"`);
      if (seenVarieties.has(v.id)) problems.push(`duplicate variety id ${v.id}`);
      seenVarieties.add(v.id);
    }
  }
  if (problems.length) {
    failed++;
    console.error(`✗ crops/${file}`);
    for (const p of problems) console.error(`    ${p}`);
  }
}

if (failed) {
  console.error(`\n${failed} of ${files.length} crop files have problems.`);
  process.exit(1);
}
console.log(`✓ ${files.length} crop files are valid.`);
