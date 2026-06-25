import { readFileSync, writeFileSync } from 'node:fs';

let c = readFileSync('README.md', 'utf8');

// 1. Update neko-not-yoshi description (appears twice: in table and is same text)
c = c.replaceAll(
  'PII, customer names, and secrets pre-push detection',
  'PII, customer names, and secrets pre-push detection (with at-rest encryption and whitelist)'
);

// 2. Update pii-mask-yoshi description
c = c.replaceAll(
  'Auto PII masking on file read (MCP server)',
  'Auto PII masking on file read with at-rest encryption (MCP server)'
);

// 3. Update architecture diagram: add whitelist connection
c = c.replace(
  'SECRET -.->|"NGword dict"| PII',
  'SECRET -.->|"NGword dict + whitelist"| PII'
);

writeFileSync('README.md', c, 'utf8');
console.log('neko-HQ README updated');
