import { shouldGenerateWarrantyPdf } from '../../src/services/warrantyPdfGuard';

const cases = [
  { confirmed: true, expectGenerate: true },
  { confirmed: false, expectGenerate: false },
];

let failed = 0;
for (const c of cases) {
  const result = shouldGenerateWarrantyPdf(c.confirmed);
  if (result !== c.expectGenerate) {
    console.error(`Case failed: confirmed=${c.confirmed} -> expected ${c.expectGenerate} got ${result}`);
    failed += 1;
  } else {
    console.log(`Case passed: confirmed=${c.confirmed}`);
  }
}

process.exit(failed === 0 ? 0 : 2);
