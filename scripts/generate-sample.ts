// Generates a realistic *fake* Revolut CSV statement for demos and tests:
//   npm run sample            -> samples/revolut-sample.csv
// Dates are relative to today so the dashboard always looks current.
import { mkdirSync, writeFileSync } from "node:fs";
import { sampleRevolutCsv } from "../src/lib/server/sampleData";

const csv = sampleRevolutCsv();
mkdirSync("samples", { recursive: true });
writeFileSync("samples/revolut-sample.csv", csv);
console.log(`Wrote samples/revolut-sample.csv (${csv.trimEnd().split("\n").length - 1} rows)`);
